"""TreinaMEMO: thermodynamic scenario API. Vercel Python serverless handler.
This is a physics-informed sensitivity model, not a validated compressor map.
Uses CoolProp (real EOS), thermodynamic energy balances, and experimental calibration.
"""
from http.server import BaseHTTPRequestHandler
import json, math, pathlib
try:
    from CoolProp.CoolProp import PropsSI
    HAS_COOLPROP=True
except ImportError:
    HAS_COOLPROP=False

ATM=101325.0
PSI=6894.757293168
REPROPS={'R134a','R290'}
# Laboratorial assumptions: not manufacturer-validated
CP_BEER=4000.0 # J/(kg K) assumed; tune with density/Brix/alcohol
RHO_BEER=1010.0 # kg/m3 assumed

def psig_to_pa(x):return ATM+float(x)*PSI
def pa_to_psig(x):return (x-ATM)/PSI
def prop(out,pairs,fluid):return float(PropsSI(out,*pairs,fluid))
def pt(p,fluid):return prop('T',('P',p,'Q',0),fluid)-273.15

def ensure(v,lo,hi,name):
    v=float(v)
    if not math.isfinite(v) or not lo<=v<=hi: raise ValueError(f'{name}: valor fora do intervalo [{lo}, {hi}]')
    return v

def solve(payload):
    if not HAS_COOLPROP:raise RuntimeError('CoolProp não disponível no servidor. Confira requirements.txt e o deploy.')
    reference=payload.get('reference') or {}
    scenario=payload.get('scenario') or {}
    refrigerant=str(reference.get('refrigerant','R134a'))
    if refrigerant not in REPROPS:raise ValueError('Refrigerante não suportado: '+refrigerant)
    def r(name,lo,hi):return ensure(reference[name],lo,hi,name)
    def s(name,default,lo,hi):return ensure(scenario.get(name,default),lo,hi,name)
    amb0=r('ambient',-10,55)
    tin0=r('beer_in',0,45)
    tout0=r('beer_out',-2,40)
    flow0=r('beer_flow',1,500)
    high0=r('high_psig',15,450)
    low0=r('suction_psig',-10,150)
    t_suction0=r('suction_temp',-40,70)
    t_liq0=r('condenser_out',-20,100)
    t_discharge0=r('discharge_temp',-5,170)
    if not tin0>tout0:raise ValueError('O ensaio de referência precisa ter entrada de chope acima da saída')
    if high0<=low0+8:raise ValueError('Pressão de alta precisa superar a de sucção')
    ph0=psig_to_pa(high0);pl0=psig_to_pa(low0)
    tc0=pt(ph0,refrigerant);te0=pt(pl0,refrigerant)
    if t_suction0 < te0-1:raise ValueError('Temperatura de sucção incompatível com o estado vapor')
    h1=prop('H',('P',pl0,'T',max(te0+0.5,t_suction0)+273.15),refrigerant)
    h3=prop('H',('P',ph0,'T',min(tc0-0.25,t_liq0)+273.15),refrigerant)
    h2s=prop('H',('P',ph0,'S',prop('S',('P',pl0,'T',max(te0+0.5,t_suction0)+273.15),refrigerant)),refrigerant)
    # calibrate apparent isentropic efficiency from measured discharge enthalpy only if physically valid
    h2meas=prop('H',('P',ph0,'T',max(tc0+0.5,t_discharge0)+273.15),refrigerant)
    eta_obs=(h2s-h1)/(h2meas-h1) if h2meas>h1 else 0
    eta=eta_obs if 0.35<=eta_obs<=0.9 else 0.65
    hints=[]
    if eta!=eta_obs:hints.append('Eficiência isentrópica medida inconsistente ou indisponível; adotada hipótese 0,65.')
    sc0=tc0-t_liq0
    if sc0<0:hints.append('Saída do condensador acima da temperatura de saturação: estado líquido pode não estar confirmado.')
    q0=(flow0/3600)*(RHO_BEER/1000)*CP_BEER*(tin0-tout0)
    if q0<=0:raise ValueError('Carga do chope de referência deve ser positiva')
    # fixed experimental approach terms that can be recalibrated when maps/geometry become available
    fan_heat=ensure(scenario.get('boiler_gain_w',95),0,800,'ganho térmico boiler (W)')
    speed=ensure(scenario.get('compressor_rpm',3450),1000,4500,'rotação rpm')
    disp=ensure(scenario.get('displacement_cc',19.95),1,60,'deslocamento cc')
    vdot=disp*1e-6*speed/60
    rho0=prop('D',('P',pl0,'T',max(te0+0.5,t_suction0)+273.15),refrigerant)
    qspec0=h1-h3
    if qspec0<=0:raise ValueError('Estados de entalpia da referência incompatíveis')
    eta_v=(q0+fan_heat)/(vdot*rho0*qspec0)
    if not 0.2<=eta_v<=1.1:hints.append(f'Eficiência volumétrica aparente {eta_v:.2f} fora da faixa comum: revisar vazão, estados e perdas.')
    # Condenser thermal conductance estimated from reference; remains an assumption,
    # not a validated UA or actual LMTD/air-flow model.
    mdot0=(q0+fan_heat)/qspec0
    qrej0=mdot0*(h2meas-h3)
    ua=qrej0/max(2.0,tc0-amb0)
    amb=s('ambient',amb0,-10,55)
    tin=s('beer_in',tin0,0,45)
    target=s('target_out',3.0,-1,25)
    flow=s('beer_flow',flow0,1,500)
    mode=scenario.get('mode','target')
    if mode not in ('target','flow'):raise ValueError('Modo inválido')
    # Evaporating pressure as boundary is held at the measured suction condition.
    # It cannot be inferred from these two tests; model marks this as fixed.
    pl=pl0;te=te0
    sh=max(0.5,t_suction0-te0)
    t_suc=te+sh
    h1n=prop('H',('P',pl,'T',t_suc+273.15),refrigerant)
    s1=prop('S',('P',pl,'T',t_suc+273.15),refrigerant)
    rho=prop('D',('P',pl,'T',t_suc+273.15),refrigerant)
    mdot=vdot*rho*eta_v
    # Solve compressor + condenser energy balance for condensing temperature.
    # No arbitrary high-pressure-vs-ambient multiplier.
    def calc_at(tc):
        ph=prop('P',('T',tc+273.15,'Q',0),refrigerant)
        h3n=prop('H',('T',tc- max(0.5,sc0)+273.15,'P',ph),refrigerant)
        h2sn=prop('H',('P',ph,'S',s1),refrigerant)
        h2n=h1n+(h2sn-h1n)/eta
        qe=mdot*(h1n-h3n)
        qc=mdot*(h2n-h3n)
        return ph,h3n,h2n,qe,qc
    # bracket physically plausible temperatures, bisection
    lo=max(amb+1.5,te+12,-5)
    hi=min(95.0,max(lo+15,amb+67))
    if hi<=lo:raise ValueError('Sem região de condensação válida')
    def res(tc):
        return calc_at(tc)[4]-ua*(tc-amb)
    flo,fhi=res(lo),res(hi)
    if flo*fhi>0:raise ValueError('Condição não convergiu no condensador. Revise os parâmetros/modelo.')
    for _ in range(65):
        mid=(lo+hi)/2
        if res(mid)*flo>0:lo=mid;flo=res(mid)
        else:hi=mid
    tc=(lo+hi)/2
    ph,h3n,h2n,qe,qc=calc_at(tc)
    if qe<=0:raise ValueError('Capacidade frigorífica não positiva')
    q_beer_available=max(0,qe-fan_heat)
    if mode=='target':
        if tin<=target:raise ValueError('Entrada do chope deve ser maior que a saída desejada')
        calculated_flow=q_beer_available*3600/(CP_BEER*(RHO_BEER/1000)*(tin-target))
        calculated_out=target
        q_beer=q_beer_available
    else:
        calculated_flow=flow
        calculated_out=max(-3,tin-q_beer_available*3600/(flow*(RHO_BEER/1000)*CP_BEER))
        # When capacity exceeds thermal load, no steady operation at arbitrary outlet:
        # actual outcome depends on thermal control, bypass, storage and heat transfer.
        q_beer=(flow/3600)*(RHO_BEER/1000)*CP_BEER*(tin-calculated_out)
        if q_beer_available > q_beer+5:hints.append('Capacidade excedente: saída depende de controlador, boiler e transferência de calor; resultado limitado pelo modelo.')
    t2=prop('T',('P',ph,'H',h2n),refrigerant)-273.15
    hints.append('Pressão de sucção mantida como condição de contorno do ensaio; falta curva de expansão/evaporador para prever sua variação.')
    hints.append('Temperaturas de óleo/domo e sensores de condensador não são previstas sem modelos térmicos próprios.')
    if abs(amb-amb0)>12:hints.append('Extrapolação superior a 12 °C da referência: incerteza elevada.')
    if not 0.2<=eta_v<=1.1:hints.append('Calibração volumétrica pouco plausível: não utilizar resultados quantitativamente.')
    return {
      'status':'modelo_fisico_condicionado',
      'model':'CoolProp + 1ª lei + compressor volumétrico + condensador UA (calibração única)',
      'fluid':refrigerant,'reference':{'ambient_c':amb0,'condensing_c':tc0,'evaporating_c':te0,'beer_kw':q0/1000,'beer_flow_lh':flow0,'beer_out_c':tout0,'high_psig':high0,'suction_psig':low0,'eta_isen_observed':eta_obs},
      'results':{'ambient_c':amb,'beer_in_c':tin,'beer_flow_lh':calculated_flow,'beer_out_c':calculated_out,'beer_load_kw':q_beer/1000,'refrigeration_kw':qe/1000,'condenser_kw':qc/1000,'compressor_thermodynamic_kw':mdot*(h2n-h1n)/1000,'refrigerant_kg_h':mdot*3600,'high_psig':pa_to_psig(ph),'suction_psig':pa_to_psig(pl),'condensing_c':tc,'evaporating_c':te,'discharge_c':t2,'suction_c':t_suc,'condenser_out_c':tc-max(0.5,sc0),'superheat_k':sh,'subcool_k':max(0.5,sc0),'COP_thermal':qe/(mdot*(h2n-h1n))},
      'calibration':{'ua_condenser_w_k':ua,'volumetric_eff_apparent':eta_v,'isentropic_eff_used':eta,'assumed_heat_gain_w':fan_heat,'rpm':speed,'displacement_cc':disp},
      'cautions':hints,'physical_balance_error_w':abs(qc-(qe+mdot*(h2n-h1n)))
    }

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Methods','POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type');self.end_headers()
    def do_POST(self):
        try:
            length=int(self.headers.get('Content-Length','0'))
            if length>30000: raise ValueError('Requisição muito grande')
            body=json.loads(self.rfile.read(length))
            result=solve(body);code=200
        except (ValueError,KeyError,TypeError,RuntimeError,OverflowError) as exc:
            result={'error':str(exc)};code=422
        except Exception:
            result={'error':'Falha interna de propriedades termodinâmicas. Revise as condições.'};code=500
        encoded=json.dumps(result,ensure_ascii=False,allow_nan=False).encode()
        self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Access-Control-Allow-Origin','*');self.send_header('Content-Length',str(len(encoded)));self.end_headers();self.wfile.write(encoded)
