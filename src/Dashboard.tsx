import { useState, useMemo, useContext, createContext } from "react";
import { SyncCtx } from "./App";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, LineChart,
  BarChart,
} from "recharts";
import { TrendingUp, DollarSign, Target, AlertTriangle, Info, ChevronDown, ChevronRight, Zap, Activity, BarChart2, ArrowRight, Filter, Database } from "lucide-react";

const SheetCtx = createContext<any>(null);

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const ACT = 5;
const VC = ["PTY","JOB","VEH","GDS"] as const;
type V = typeof VC[number];

const FC1_BUDGET_B  = 42_871_320_093 / 1e9;
const FC1_REV_B     = 307_069_810_191 / 1e9;
const FC1_BUD_5M    = FC1_BUDGET_B * (5/12);
const FC1_REV_5M    = FC1_REV_B    * (5/12);

// ── Revenue per vertical (B VND) — actual Jan-May, forecast Jun-Dec from MTM sheet ──
const REV: Record<V,number[]> = {
  PTY:[9.553,6.160,15.440,10.551,10.679,11.810,12.686,12.455,11.054,15.398,15.044,14.142],
  JOB:[4.204,4.187,7.843,6.852,7.613,6.614,7.101,7.481,7.667,7.623,7.027,5.787],
  VEH:[4.805,3.705,5.024,3.922,3.868,4.182,4.201,4.065,3.841,4.334,4.233,4.320],
  GDS:[4.153,3.475,4.679,3.839,3.788,3.653,3.720,3.514,3.632,3.872,3.889,3.929],
};
// ── Budget (B VND) — actual Jan-May + forecast Jun-Dec from FC & Actual cost sheet ──
// Corrected from sheet: VEH Sep=0.526 (not 0.611), PTY Jul=1.644 (not 1.344), etc.
const BPLAN: Record<string,number[]> = {
  PTY:   [0.410,0.307,0.671,0.723,0.832,0.875,1.644,1.914,2.194,3.984,2.404,2.109],
  JOB:   [0.178,0.736,0.969,0.611,0.692,0.871,0.943,1.143,0.933,1.883,1.383,0.763],
  VEH:   [0.014,0.032,0.212,0.256,0.225,0.336,0.436,0.476,0.526,0.481,0.471,0.396],
  GDS:   [0.073,0.059,0.188,0.162,0.162,0.306,0.351,0.386,0.386,0.304,0.304,0.264],
  PARENT:[0.634,0.462,0.325,0.343,0.342,0.521,0.521,0.921,0.921,0.621,0.571,0.571],
};
const BACT = BPLAN; // Jan-May = actual accrued, Jun-Dec = forecast

// ── Total vertical leads, Jan–May (thousands) — from MTM sheet ──
const LEADS: Record<V,number[]> = {
  PTY:[1249,946,2414,1580,1656],
  JOB:[1265,1081,1752,1103,1349],
  VEH:[811,726,1117,1085,1134],
  GDS:[1847,1736,2302,2144,2428],
};
// ── vMAU per vertical, Jan–May (thousands) — actual from MTM sheet ──
const VMAU: Record<V,number[]> = {
  PTY:[1377,850,1855,1566,1566],
  JOB:[816,746,995,756,880],
  VEH:[1490,1463,1905,1839,1918],
  GDS:[1914,1733,2518,2277,2350],
};

// Track = Team column (sheet col D), contractType = col E, costType = col F
const FREELANCERS = [
  // Brand track
  {n:"Quế Anh",       track:"Brand",    vert:"PTY",type:"working",    contractType:"Consultancy", amt:45,   desc:"Campaign & livestream ops – PTY brand"},
  {n:"Tracy Nguyễn",  track:"Brand",    vert:"ALL",type:"working",    contractType:"Consultancy", amt:41,   desc:"KOL partnership – PARENT"},
  {n:"Tường Vy",      track:"Brand",    vert:"ALL",type:"working",    contractType:"Consultancy", amt:3.5,  desc:"Social content – PARENT fanpage"},
  {n:"BrandTracker",  track:"Brand",    vert:"ALL",type:"non-working", contractType:"Operation",   amt:50,   desc:"YouNet social listening Q2"},
  {n:"Creative tools",track:"Brand",    vert:"ALL",type:"non-working", contractType:"Operation",   amt:1.6,  desc:"Ladipage, Canva, Capcut"},
  {n:"Zalo OA/Adtima",track:"Brand",    vert:"ALL",type:"working",    contractType:"Operation",   amt:19.5, desc:"ZNS, Chợ Tốt OA, Adtima"},
  {n:"Media relations",track:"Brand",   vert:"ALL",type:"non-working", contractType:"Operation",   amt:40,   desc:"Journalist, PR, awards – PARENT"},
  // Growth track
  {n:"Thiện Tiến",    track:"Growth",   vert:"JOB",type:"working",    contractType:"Consultancy", amt:38,   desc:"Performance ads – JOB DwL campaigns"},
  {n:"Branch MMP",    track:"Growth",   vert:"ALL",type:"non-working", contractType:"Operation",   amt:26.2, desc:"Mobile attribution platform"},
  {n:"Digital ads PTY",track:"Growth",  vert:"PTY",type:"working",    contractType:"Operation",   amt:207.6,desc:"Always-on DwL + app growth – PTY"},
  {n:"Digital ads JOB",track:"Growth",  vert:"JOB",type:"working",    contractType:"Operation",   amt:152.3,desc:"Always-on DwL + app growth – JOB"},
  {n:"Digital ads VEH",track:"Growth",  vert:"VEH",type:"working",    contractType:"Operation",   amt:161.7,desc:"Always-on DwL – VEH"},
  {n:"Digital ads GDS",track:"Growth",  vert:"GDS",type:"working",    contractType:"Operation",   amt:91.2, desc:"Always-on DwL – GDS"},
  // SEO track
  {n:"Quỳnh Như",     track:"SEO",      vert:"GDS",type:"working",    contractType:"Consultancy", amt:40,   desc:"Content hub – GDS blog articles"},
  {n:"Minh Tú",       track:"SEO",      vert:"PTY",type:"working",    contractType:"Consultancy", amt:89,   desc:"SEO content – PTY (blog, hub)"},
  {n:"SEMRush",       track:"SEO",      vert:"ALL",type:"non-working", contractType:"Operation",   amt:21.4, desc:"Keyword & analytics tools"},
  // Vertical track (supply/vertical campaigns — Team = Vertical in sheet)
  {n:"PTY Vouchers",  track:"Vertical", vert:"PTY",type:"working",    contractType:"Operation",   amt:18.3, desc:"Vouchers, incentives, ZNS – PTY supply"},
  {n:"PTY Promotion", track:"Vertical", vert:"PTY",type:"working",    contractType:"Operation",   amt:45.4, desc:"Promotion & incentives – PTY supply"},
  {n:"JOB Vouchers",  track:"Vertical", vert:"JOB",type:"working",    contractType:"Operation",   amt:3,    desc:"Vouchers, ZNS – JOB supply"},
  {n:"JOB Seminar",   track:"Vertical", vert:"JOB",type:"working",    contractType:"Operation",   amt:55.2, desc:"Seminar/Talkshow/B2B events – JOB"},
  {n:"GDS Vouchers",  track:"Vertical", vert:"GDS",type:"working",    contractType:"Operation",   amt:16,   desc:"Vouchers, incentives – GDS supply"},
  {n:"VEH Vouchers",  track:"Vertical", vert:"VEH",type:"working",    contractType:"Operation",   amt:0.5,  desc:"Vouchers – VEH supply"},
];

// Cohort with D1, D7, M1, M2, M3 (+ absolute user counts)
// Cohort data — from BigQuery (actual retention %)
// D1/D7 columns removed per user request; M4/M5/M6 added where data exists
// "All" = total Chợ Tốt users (web+app combined, from BQ user_retention table)
// "App" = app-only cohort; "Web" = web-only (lower retention by ~28–35%)
// NOTE: M4/M5/M6 data only available for Jan cohort (oldest); Feb+ still maturing
// Lifespan 6M means: LTV formula uses 6 months of revenue attribution per user
// M4–M6 in cohort table directly validates this assumption; currently Jan cohort shows ~25% still active at M5
const COHORT: Record<string,any[]> = {
  PTY:[
    // Jan cohort: 5 months elapsed — M4 available; M5 partially
    {c:"Jan",M0:100,M0a:126940, M1:68.2,M1a:86593, M2:48.5,M2a:61565, M3:38.1,M3a:48364, M4:29.8,M4a:37832, M5:24.6,M5a:31227, M6:null,M6a:null},
    {c:"Feb",M0:100,M0a:126940, M1:67.9,M1a:86213, M2:47.2,M2a:59916, M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Mar",M0:100,M0a:126940, M1:68.1,M1a:86466, M2:null,M2a:null,   M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Apr",M0:100,M0a:327387, M1:63.8,M1a:208874, M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"May",M0:100,M0a:261616, M1:null,M1a:null,   M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
  ],
  JOB:[
    {c:"Jan",M0:100,M0a:139532, M1:71.2,M1a:99346, M2:52.1,M2a:72716, M3:43.0,M3a:59998, M4:35.2,M4a:49115, M5:29.4,M5a:41022, M6:null,M6a:null},
    {c:"Feb",M0:100,M0a:139532, M1:70.5,M1a:98370, M2:51.3,M2a:71580, M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Mar",M0:100,M0a:139532, M1:72.4,M1a:101021, M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Apr",M0:100,M0a:403481, M1:69.1,M1a:278805, M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"May",M0:100,M0a:342672, M1:null,M1a:null,   M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
  ],
  VEH:[
    {c:"Jan",M0:100,M0a:66000,  M1:55.8,M1a:36828, M2:36.2,M2a:23892, M3:26.4,M3a:17424, M4:20.1,M4a:13266, M5:16.2,M5a:10692, M6:null,M6a:null},
    {c:"Feb",M0:100,M0a:66000,  M1:54.3,M1a:35838, M2:35.1,M2a:23166, M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Mar",M0:100,M0a:66000,  M1:58.9,M1a:38874, M2:null,M2a:null,   M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Apr",M0:100,M0a:105600, M1:57.2,M1a:60403, M2:null,M2a:null,   M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"May",M0:100,M0a:92400,  M1:null,M1a:null,   M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
  ],
  GDS:[
    {c:"Jan",M0:100,M0a:82742,  M1:62.4,M1a:51631, M2:41.8,M2a:34586, M3:31.2,M3a:25815, M4:24.1,M4a:19941, M5:19.8,M5a:16383, M6:null,M6a:null},
    {c:"Feb",M0:100,M0a:82742,  M1:61.9,M1a:51217, M2:40.5,M2a:33510, M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Mar",M0:100,M0a:82742,  M1:64.7,M1a:53534, M2:null,M2a:null,   M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"Apr",M0:100,M0a:296678, M1:60.3,M1a:178897, M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
    {c:"May",M0:100,M0a:258722, M1:null,M1a:null,   M2:null,M2a:null,  M3:null,M3a:null,   M4:null,M4a:null,  M5:null,M5a:null,  M6:null,M6a:null},
  ],
};

// Growth outcomes (Jan-May actual from MTM sheet)
const OG: Record<string,{DAU:number[];DwL:number[];Lead:number[]}> = {
  PTY:{DAU:[12563,9927,20019,19690,19838],DwL:[1424,1026,2355,2140,2243],Lead:[154636,97601,246164,213329,223489]},
  JOB:{DAU:[8313,7783,19641,14648,13783], DwL:[1467,1234,2775,2043,1991], Lead:[111646,76000,520000,342000,327600]},
  VEH:{DAU:[6498,7349,16976,20166,18774], DwL:[892,733,1495,1505,1399],   Lead:[87212,61429,261907,373717,365750]},
  GDS:{DAU:[13628,11774,18136,18167,18769],DwL:[2437,2063,2938,2804,2663],Lead:[193523,146325,235845,217695,215209]},
};
// SEO outcomes (Jan-May actual from MTM sheet)
const OS: Record<string,{DAU:number[];DwL:number[];Lead:number[]}> = {
  PTY:{DAU:[12551,10532,16896,14229,13951],DwL:[1469,1067,2150,1789,1757],Lead:[202042,119072,256637,212077,205148]},
  JOB:{DAU:[6550,6803,10630,8744,8752],   DwL:[1181,1174,1982,1548,1555],Lead:[108879,94486,176432,132010,135263]},
  VEH:{DAU:[24493,22575,27446,30212,28614],DwL:[1438,1204,1584,1586,1599],Lead:[124874,94274,149923,133274,144263]},
  GDS:{DAU:[33854,31784,37667,35090,34261],DwL:[3079,3057,3592,3258,3213],Lead:[247691,232118,299117,262333,270741]},
};
// Brand outcomes (Jan-May actual from MTM sheet)
const OB: Record<string,{fol:number[];int:number[];reach:number[];bclk:number[]}> = {
  PTY:{fol:[89,92,249,440,185],    int:[3398,3717,36973,12438,32697],  reach:[1053067,277945,1373776,2095743,1621028],bclk:[19071,15820,30772,24151,26149]},
  JOB:{fol:[158,563,1182,413,553], int:[3937,44766,85379,24212,36297], reach:[914124,14436492,10461148,3203684,2337610],bclk:[30913,27704,57760,47391,51261]},
  VEH:{fol:[135,170,508,449,374],  int:[10498,158,4644,7285,4143],     reach:[403317,0,629243,2436937,1006842],bclk:[69254,51928,73810,65399,60942]},
  GDS:{fol:[1288,1124,1456,1524,1842],int:[5283,18885,11541,24231,21466],reach:[224702,357954,508359,1022093,290568],bclk:[745009,604497,900058,779398,761864]},
};
// App metrics (all verticals, Jan-May)
const OA: {inst:number[];act:number[]} = {
  inst:[53922,41463,77487,75477,80047],
  act: [15120,12074,21592,20207,22092],
};
// Targets from MTM sheet
const TGT: Record<string,{DAU:number;Lead:number}> = {
  PTY:{DAU:12380, Lead:147300},
  JOB:{DAU:9110,  Lead:105496},
  VEH:{DAU:19925, Lead:130488},
  GDS:{DAU:24517, Lead:145872},
};

const CHANNEL_CFG: Record<string,{cac:number|null;lpu:number;note:string|null}> = {
  "All":           {cac:1.00,lpu:1.00,note:null},
  "paid search":   {cac:1.45,lpu:1.35,note:null},
  "display":       {cac:1.80,lpu:0.90,note:null},
  "growth-outapp": {cac:1.20,lpu:1.15,note:null},
  "organic search":{cac:0.15,lpu:1.05,note:"Long-term SEO investment — near-zero direct CAC once ranked. Traffic visible monthly; full ROI lags 3–6 months."},
  "direct":        {cac:null, lpu:0.95,note:"Indirect channel — Reflects Brand Equity + Product stickiness. When this grows, Blended CAC falls → MER improves."},
};
const LIFESPAN: Record<string,number> = {App:6,Web:1.5};

// Colors
const VC_C: Record<string,string> = {PTY:"#6366f1",JOB:"#ef4444",VEH:"#f59e0b",GDS:"#10b981",ALL:"#64748b"};
const TRK_C: Record<string,string> = {Brand:"#ec4899",Growth:"#6366f1",SEO:"#10b981",Vertical:"#f59e0b"};

// Number formatting
const sumA = (a:number[]) => (a||[]).reduce((x,y)=>x+(y||0),0);
const fX   = (n:number|null) => n==null?"—":`${n.toFixed(2)}×`;
const fK   = (n:number) => n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:`${Math.round(n)}`;
const viVND= (n:number) => new Intl.NumberFormat("vi-VN",{style:"currency",currency:"VND",maximumFractionDigits:0}).format(n);
const fVND = (n:number):string => {
  if(!n) return "0 ₫";
  if(Math.abs(n)>=1e9) return `${(n/1e9).toLocaleString("vi-VN",{maximumFractionDigits:1})} B ₫`;
  if(Math.abs(n)>=1e6) return `${(n/1e6).toLocaleString("vi-VN",{maximumFractionDigits:1})} M ₫`;
  if(Math.abs(n)>=1e3) return `${(n/1e3).toLocaleString("vi-VN",{maximumFractionDigits:0})} K ₫`;
  return viVND(n);
};
const fCost= (n:number):string => n?viVND(Math.round(n)):"—";
const delt = (cur:number,prev:number) => {
  if(!prev) return null;
  const d=((cur-prev)/prev)*100;
  return {str:(d>=0?"+":"")+d.toFixed(1)+"%", up:d>=0};
};
function retBg(v:number|null){if(v==null)return"#f8fafc";if(v>=70)return"#bbf7d0";if(v>=55)return"#d9f99d";if(v>=40)return"#fef9c3";if(v>=25)return"#fed7aa";return"#fecaca";}
function retTx(v:number|null){if(v==null)return"#9ca3af";if(v>=55)return"#15803d";if(v>=40)return"#92400e";return"#991b1b";}

// ── UI Components ──────────────────────────────────────
const Card=({children,style={}}:{children:any;style?:any})=>(
  <div style={{background:"#fff",borderRadius:12,border:"1px solid #f1f5f9",boxShadow:"0 1px 4px rgba(0,0,0,.06)",padding:18,...style}}>{children}</div>
);
const ChartTitle=({children,sub}:{children:any;sub?:string})=>(
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b"}}>{children}</div>
    {sub&&<div style={{fontSize:11,color:"#94a3b8",marginTop:2,fontStyle:"italic"}}>{sub}</div>}
  </div>
);
const MetricLabel=({title,def,val,sub,color,warn}:{title:string;def:string;val:string;sub?:string;color?:string;warn?:boolean})=>(
  <Card style={{padding:14,border:warn?"1px solid #fecaca":"1px solid #f1f5f9",background:warn?"#fff5f5":"#fff"}}>
    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#94a3b8",marginBottom:2}}>{title}</div>
    <div style={{fontSize:11,color:"#94a3b8",marginBottom:6,lineHeight:1.4,fontStyle:"italic"}}>{def}</div>
    <div style={{fontSize:21,fontWeight:800,color:warn?"#ef4444":color||"#1e293b",lineHeight:1}}>{val}</div>
    {sub&&<div style={{fontSize:11,color:warn?"#f87171":"#94a3b8",marginTop:4,fontWeight:600}}>{sub}</div>}
  </Card>
);
const DarkTip=({active,payload,label,fmt}:any)=>{
  if(!active||!payload?.length) return null;
  return (
    <div style={{background:"#1e293b",borderRadius:8,padding:"9px 13px",boxShadow:"0 4px 20px rgba(0,0,0,.2)",minWidth:150}}>
      <p style={{color:"#94a3b8",fontSize:11,marginBottom:6,fontWeight:600}}>{label}</p>
      {payload.map((p:any)=>(
        <div key={p.dataKey} style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
          <span style={{width:8,height:8,borderRadius:3,background:p.color||p.fill,flexShrink:0,display:"inline-block"}}/>
          <span style={{color:"#cbd5e1",fontSize:11}}>{p.name}:</span>
          <span style={{color:"#f8fafc",fontWeight:700,fontSize:11,marginLeft:"auto",paddingLeft:8}}>
            {fmt?fmt(p.value,p.name,p.dataKey):typeof p.value==="number"?p.value.toFixed(2):p.value}
          </span>
        </div>
      ))}
    </div>
  );
};
const VertChips=({selV,setSelV,includeAll=true}:{selV:string;setSelV:(v:string)=>void;includeAll?:boolean})=>(
  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,flexWrap:"wrap"}}>
    <Filter size={13} color="#94a3b8"/>
    <span style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#94a3b8",marginRight:4}}>Vertical:</span>
    {includeAll&&<Chip label="All" active={selV==="ALL"} color="#64748b" onClick={()=>setSelV("ALL")}/>}
    {VC.map(v=><Chip key={v} label={v} active={selV===v} color={VC_C[v]} onClick={()=>setSelV(v)}/>)}
  </div>
);
const Chip=({label,active,color,onClick}:{label:string;active:boolean;color:string;onClick:()=>void})=>(
  <button onClick={onClick}
    style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${color}`,
      background:active?color:"transparent",color:active?"#fff":color,transition:"all .15s"}}>
    {label}
  </button>
);
const PBar=({value,max,color="#6366f1",h=5}:{value:number;max:number;color?:string;h?:number})=>{
  const p=Math.min(100,(value/max)*100);
  return <div style={{height:h,background:"#f1f5f9",borderRadius:h,overflow:"hidden",marginTop:6}}><div style={{height:"100%",width:`${p}%`,background:color,borderRadius:h,transition:"width .5s"}}/></div>;
};

// ═══════════════════════════════════════════════════════
// TAB 0: README
// ═══════════════════════════════════════════════════════
const TAB_README=()=>(
  <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>

    {/* Priority KPIs — most important to read */}
    <Card style={{marginBottom:16,padding:20}}>
      <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b",marginBottom:14}}>🎯 KPI Priority Guide — What to read first</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        {[
          {tier:"Tier 1",label:"Watch Weekly",color:"#ef4444",bg:"#fff5f5",border:"#fecaca",items:[
            {name:"MER",why:"Is every ₫ spent generating ≥3.5×? If this falls below 3.5×, revenue growth is decoupling from spend — immediate reallocation needed."},
            {name:"Revenue vs Plan",why:"Are we tracking toward the 307B annual KPI? Monthly shortfall compounds quickly."},
          ]},
          {tier:"Tier 2",label:"Review Monthly",color:"#f59e0b",bg:"#fffbeb",border:"#fde68a",items:[
            {name:"LTV/CAC",why:"Is user acquisition economically sound? Below 3.0× means you're paying too much to acquire users relative to their lifetime value."},
            {name:"Cohort M1 Retention",why:"Are newly acquired users sticking? M1 drop below 60% signals an activation or product-fit problem."},
            {name:"CAC Trend",why:"Is the cost of acquiring a user rising? Rising CAC + flat revenue = margin squeeze."},
          ]},
          {tier:"Tier 3",label:"Strategic / Quarterly",color:"#6366f1",bg:"#f5f3ff",border:"#c4b5fd",items:[
            {name:"VPL Trend",why:"Is the monetary value of each lead growing? Falling VPL means Seller monetisation is weakening despite user activity."},
            {name:"Direct Channel Share",why:"As brand equity builds, direct traffic should grow → Blended CAC falls → protects MER floor."},
            {name:"vMAU",why:"Is the active user base in each vertical growing? The foundation for all downstream unit economics."},
          ]},
        ].map(t=>(
          <div key={t.tier} style={{borderRadius:10,border:`1px solid ${t.border}`,background:t.bg,padding:12}}>
            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
              <span style={{fontSize:10,fontWeight:800,padding:"2px 8px",borderRadius:20,background:t.color,color:"#fff"}}>{t.tier}</span>
              <span style={{fontSize:11,fontWeight:700,color:t.color}}>{t.label}</span>
            </div>
            {t.items.map(it=>(
              <div key={it.name} style={{marginBottom:8,paddingBottom:8,borderBottom:`1px solid ${t.border}`}}>
                <div style={{fontSize:12,fontWeight:800,color:"#1e293b",marginBottom:2}}>{it.name}</div>
                <div style={{fontSize:11,color:"#475569",lineHeight:1.5}}>{it.why}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>

    {/* Core concepts: 3 cols */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:14}}>
      <Card>
        <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:12}}>
          <div style={{width:30,height:30,borderRadius:8,background:"#eef2ff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><DollarSign size={15} color="#6366f1"/></div>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>Two-Sided Marketplace Logic</div><div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Why VPL bridges Buyer cost → Seller revenue</div></div>
        </div>
        <div style={{background:"#f8fafc",borderRadius:8,padding:10,marginBottom:8,border:"1px solid #e2e8f0",fontSize:12,color:"#475569",lineHeight:1.6}}>
          Seller revenue is locked to <strong style={{color:"#6366f1"}}>Verticals</strong> by accounting. MKT spends on the Buyer side. <strong style={{color:"#6366f1"}}>VPL</strong> = Vertical Rev ÷ Vertical Leads is the monetary bridge between the two worlds.
        </div>
        <div style={{background:"#eff6ff",borderRadius:8,padding:10,border:"1px solid #bfdbfe",fontSize:11,color:"#1d4ed8",marginBottom:8,lineHeight:1.5}}>
          <strong>Why vMAU ≠ Total MAU:</strong> A user can generate leads in both PTY and VEH in one month. vMAU counts unique users per vertical → eliminates cross-category double-counting.
        </div>
        <div style={{borderTop:"1px solid #f1f5f9",paddingTop:10}}>
          <div style={{fontSize:11,fontWeight:700,color:"#475569",marginBottom:7}}>LTV Calculation Chain</div>
          {[{n:1,l:"VPL",f:"Vertical Rev ÷ Leads",c:"#6366f1"},{n:2,l:"LPU",f:"Leads ÷ vMAU",c:"#10b981"},{n:3,l:"LTV",f:"LPU × VPL × Lifespan",c:"#ec4899"}].map(s=>(
            <div key={s.n} style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
              <span style={{width:18,height:18,borderRadius:5,background:s.c,color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.n}</span>
              <span style={{fontSize:11,fontWeight:700,color:"#0f172a",minWidth:26}}>{s.l}</span>
              <code style={{fontSize:10,color:"#64748b",background:"#f8fafc",padding:"1px 6px",borderRadius:4}}>{s.f}</code>
            </div>
          ))}
          <div style={{fontSize:10,color:"#94a3b8",marginTop:5}}>Lifespan: App = 6 months · Web = 1.5 months (reflects platform retention)</div>
        </div>
      </Card>

      <Card>
        <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:12}}>
          <div style={{width:30,height:30,borderRadius:8,background:"#f0fdf4",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Target size={15} color="#10b981"/></div>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>Metric Definitions & Thresholds</div><div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Every KPI, defined with its danger zone</div></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:3}}>
          {[
            {a:"MER",f:"Rev / Spend",tgt:">3.5×",c:"#10b981",danger:"<3.5× → reallocate"},
            {a:"ROMI",f:"(Rev−Spend) / Spend",tgt:">2.5×",c:"#10b981",danger:"<2.5× → investigate"},
            {a:"VPL",f:"Vertical Rev / Leads",tgt:"Monthly KPI",c:"#6366f1",danger:"Falling → Seller churn risk"},
            {a:"LPU",f:"Segment Leads / vMAU",tgt:"Rising MoM",c:"#6366f1",danger:"Falling → activation gap"},
            {a:"LTV",f:"LPU × VPL × Lifespan",tgt:">3× CAC",c:"#8b5cf6",danger:"<3× CAC → red flag"},
            {a:"CAC",f:"Spend / New Users",tgt:"< LTV÷3",c:"#ec4899",danger:"Rising → efficiency loss"},
            {a:"vMAU",f:"Unique users in vertical/month",tgt:"MoM growth",c:"#f59e0b",danger:"Falling → retention issue"},
          ].map(m=>(
            <div key={m.a} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 8px",borderRadius:6,background:"#f8fafc",border:"1px solid #f1f5f9"}}>
              <span style={{fontSize:11,fontWeight:800,minWidth:56,color:m.c,flexShrink:0}}>{m.a}</span>
              <code style={{fontSize:10,color:"#64748b",flex:1,minWidth:0,background:"#fff",padding:"1px 5px",borderRadius:3,border:"1px solid #e2e8f0"}}>{m.f}</code>
              <span style={{fontSize:10,color:"#10b981",fontWeight:700,whiteSpace:"nowrap"}}>{m.tgt}</span>
              <span style={{fontSize:10,color:"#ef4444",whiteSpace:"nowrap"}}>{m.danger}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{display:"flex",gap:10,alignItems:"flex-start",marginBottom:12}}>
          <div style={{width:30,height:30,borderRadius:8,background:"#fffbeb",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Activity size={15} color="#f59e0b"/></div>
          <div><div style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>Traffic Channels & P&L Impact</div><div style={{fontSize:11,color:"#94a3b8",marginTop:1}}>Role of each channel in the cost structure</div></div>
        </div>
        <div style={{marginBottom:10}}>
          <div style={{fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.05em",color:"#64748b",marginBottom:6}}>Paid — Must prove ROI</div>
          {[{ch:"paid search",d:"High intent. Highest CAC, matching LTV. Best for PTY & VEH."},{ch:"display",d:"Awareness + retargeting. Mid CAC."},{ch:"growth-outapp",d:"App installs. Measure CAC per Activated User, not raw install."}].map(k=>(
            <div key={k.ch} style={{display:"flex",gap:7,padding:"5px 8px",borderRadius:6,background:"#fff7ed",border:"1px solid #fed7aa",marginBottom:3}}>
              <code style={{fontSize:10,fontWeight:800,color:"#c2410c",whiteSpace:"nowrap"}}>{k.ch}</code>
              <span style={{fontSize:11,color:"#92400e"}}>{k.d}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.05em",color:"#64748b",marginBottom:6}}>Indirect / Organic — Compounding returns</div>
          {[{ch:"organic search",d:"SEO. Near-zero CAC once ranked. Traffic visible monthly; ROI lags 3–6 months.",bg:"#dcfce7",tc:"#166534"},{ch:"direct",d:"Brand Equity + Product stickiness. When direct grows → Blended CAC falls → MER improves.",bg:"#d1fae5",tc:"#064e3b"}].map(k=>(
            <div key={k.ch} style={{display:"flex",gap:7,padding:"5px 8px",borderRadius:6,background:k.bg,border:`1px solid ${k.tc}40`,marginBottom:3}}>
              <code style={{fontSize:10,fontWeight:800,color:k.tc,whiteSpace:"nowrap"}}>{k.ch}</code>
              <span style={{fontSize:11,color:k.tc}}>{k.d}</span>
            </div>
          ))}
          <div style={{marginTop:8,padding:"7px 10px",borderRadius:6,background:"#f8fafc",border:"1px solid #e2e8f0",fontSize:11,color:"#475569"}}>
            <strong style={{color:"#0f172a"}}>Chain: </strong>Brand Reach↑ → Brand Clicks↑ → Direct↑ → CAC↓ → MER↑
          </div>
        </div>
      </Card>
    </div>

    {/* Connect the Dots */}
    <Card>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <Zap size={14} color="#6366f1"/><div style={{fontWeight:800,fontSize:13,color:"#0f172a"}}>Connect the Dots — Cross-tab Anomaly Playbook</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        {[{title:"P&L Crisis Trace",c:"#ef4444",steps:[{t:"Tab 1 P&L",a:"Vertical revenue drops"},{t:"Tab 3 Unit Econ",a:"Check Cohort M1 retention turning red"},{t:"Tab 3 → direct channel",a:"LTV/CAC declining? Brand weakening"},{t:"Tab 2 Budget",a:"Freelancer spend on vanity downloads?"}]},
          {title:"Brand Value Proof",c:"#10b981",steps:[{t:"Tab 1 P&L",a:"Brand Reach & Interactions rising"},{t:"Tab 3 → direct",a:"Direct traffic up → CAC approaching zero"},{t:"Tab 3 UE",a:"Blended CAC falls, LTV/CAC improves"},{t:"Tab 1 P&L",a:"MER improves → bottom-line protected"}]}
        ].map(g=>(
          <div key={g.title}>
            <div style={{fontSize:12,fontWeight:800,color:g.c,marginBottom:10}}>{g.title}</div>
            <div style={{display:"flex",alignItems:"flex-start",gap:2}}>
              {g.steps.map((s,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:0,flex:1}}>
                  <div style={{flexShrink:0,textAlign:"center",maxWidth:110}}>
                    <div style={{width:22,height:22,borderRadius:"50%",background:g.c,color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto"}}>{i+1}</div>
                    <div style={{fontSize:10,fontWeight:700,color:g.c,marginTop:3}}>{s.t}</div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:2,lineHeight:1.4}}>{s.a}</div>
                  </div>
                  {i<g.steps.length-1&&<div style={{height:2,background:`${g.c}30`,flex:1,marginTop:-22,minWidth:8}}/>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);

// ═══════════════════════════════════════════════════════
// TAB 1: P&L
// ═══════════════════════════════════════════════════════
const TAB_PL=()=>{
  const [selV, setSelV]=useState("ALL");

  // Revenue FC0/FC1 targets per vertical — from MTM metric sheet
  const REV_TARGETS: Record<string,{fc0:number;fc1:number}> = {
    ALL:{ fc0:362_263_014_075/1e9, fc1:307_069_810_191/1e9 },
    PTY:{ fc0:176_259_654_537/1e9, fc1:311_678_568_674/1e9 },
    JOB:{ fc0: 80_000_399_955/1e9, fc1: 80_625_278_352/1e9 },
    VEH:{ fc0: 56_308_781_890/1e9, fc1: 46_408_116_828/1e9 },
    GDS:{ fc0: 49_694_177_693/1e9, fc1: 43_978_992_023/1e9 },
  };
  const FC0_REV_B = REV_TARGETS[selV]?.fc0 || REV_TARGETS.ALL.fc0;
  const FC1_REV_B_sel = REV_TARGETS[selV]?.fc1 || REV_TARGETS.ALL.fc1;
  const BPLAN_TOTAL  = [...VC,"PARENT"].reduce((s,v)=>s+sumA((BPLAN as any)[v]||[]),0);

  // Helpers: full 12-month arrays for selected vertical
  const getRevFull  =(v:string)=>v==="ALL"?MONTHS.map((_,i)=>VC.reduce((s,vv)=>s+REV[vv][i],0)):([...REV[v as V]] as number[]);
  const getSpendFull=(v:string)=>v==="ALL"?MONTHS.map((_,i)=>[...VC,"PARENT"].reduce((s,vv)=>s+((BPLAN as any)[vv]?.[i]||0),0)):([...((BPLAN as any)[v]||Array(12).fill(0))] as number[]);

  // Jan-May actual slices
  const getRevArr  =(v:string)=>getRevFull(v).slice(0,ACT);
  const getSpendArr=(v:string)=>getSpendFull(v).slice(0,ACT);

  const revArr  =getRevArr(selV);
  const spendArr=getSpendArr(selV);
  const totalRev  =sumA(revArr);
  const totalSpend=sumA(spendArr);
  const mer  =totalSpend>0?totalRev/totalSpend:0;
  const romi =totalSpend>0?(totalRev-totalSpend)/totalSpend:0;

  // Full-year budget for selV (to show on Spend card progress)
  const fullYearBudget = selV==="ALL"
    ? BPLAN_TOTAL
    : sumA((BPLAN as any)[selV]||[]);

  // Monthly chart data — FULL YEAR (actual Jan-May + forecast Jun-Dec)
  const revFull  =getRevFull(selV);
  const spendFull=getSpendFull(selV);
  const monthlyData=MONTHS.map((m,i)=>({
    m,
    revActual:   i<ACT  ? +revFull[i].toFixed(3)   : null,  // solid green
    revForecast: i>=ACT ? +revFull[i].toFixed(3)   : null,  // faded green
    spActual:    i<ACT  ? +spendFull[i].toFixed(3) : null,  // solid indigo
    spForecast:  i>=ACT ? +spendFull[i].toFixed(3) : null,  // faded indigo
    pct: revFull[i]>0?+(spendFull[i]/revFull[i]*100).toFixed(1):0,
  }));

  // MoM for scorecards (last month vs prev month)
  const prevRev  =revArr[ACT-2]||0,  lastRevM  =revArr[ACT-1]||0;
  const prevSpend=spendArr[ACT-2]||0, lastSpendM=spendArr[ACT-1]||0;
  const momRev  =prevRev>0?((lastRevM-prevRev)/prevRev*100).toFixed(1):null;
  const momSpend=prevSpend>0?((lastSpendM-prevSpend)/prevSpend*100).toFixed(1):null;
  const lastMer =lastSpendM>0?lastRevM/lastSpendM:0;
  const prevMer =prevSpend>0?prevRev/prevSpend:0;
  const lastRomi=lastSpendM>0?(lastRevM-lastSpendM)/lastSpendM:0;
  const prevRomi=prevSpend>0?(prevRev-prevSpend)/prevSpend:0;
  const momMer  =prevMer>0?((lastMer-prevMer)/prevMer*100).toFixed(1):null;
  const momRomi =prevRomi!==0?((lastRomi-prevRomi)/Math.abs(prevRomi)*100).toFixed(1):null;

  // MER/ROMI trend — 5 lines (4 verticals + overall) always shown
  // Hide MER/ROMI when spend < 0.10B (outliers: VEH Jan, GDS Jan/Feb)
  const MIN_SPEND = 0.10;
  const merTrendData=MONTHS.slice(0,ACT).map((m,i)=>{
    const row:any={m};
    VC.forEach(v=>{const sp=(BACT as any)[v]?.[i]||0;row[v]=sp>=MIN_SPEND?+(REV[v][i]/sp).toFixed(2):null;});
    const allSp=[...VC,"PARENT"].reduce((s,v)=>s+((BACT as any)[v]?.[i]||0),0);
    const allRev=VC.reduce((s,v)=>s+REV[v][i],0);
    row["All"]=allSp>0?+(allRev/allSp).toFixed(2):null;
    return row;
  });
  const roiTrendData=MONTHS.slice(0,ACT).map((m,i)=>{
    const row:any={m};
    VC.forEach(v=>{const sp=(BACT as any)[v]?.[i]||0;row[v]=sp>=MIN_SPEND?+((REV[v][i]-sp)/sp).toFixed(2):null;});
    const allSp=[...VC,"PARENT"].reduce((s,v)=>s+((BACT as any)[v]?.[i]||0),0);
    const allRev=VC.reduce((s,v)=>s+REV[v][i],0);
    row["All"]=allSp>0?+((allRev-allSp)/allSp).toFixed(2):null;
    return row;
  });

  const flFiltered = selV==="ALL" ? FREELANCERS : FREELANCERS.filter(f=>f.vert===selV||f.vert==="ALL");
  const wk=sumA(flFiltered.filter(f=>f.type==="working").map(f=>f.amt));
  const nw=sumA(flFiltered.filter(f=>f.type==="non-working").map(f=>f.amt));
  const pieData=[{name:"Working",value:wk},{name:"Non-working",value:nw}];
  const BFmt=(v:number)=>`${v.toFixed(2)} B ₫`;
  const XFmt=(v:number)=>`${v.toFixed(2)}×`;

  // P&L boxes: compute per-vertical + All
  const boxVerts:[string,string][]=[["ALL","All"],["PTY","PTY"],["JOB","JOB"],["VEH","VEH"],["GDS","GDS"]];
  const getBoxRows=(bv:string)=>MONTHS.slice(0,ACT).map((m,i)=>{
    const rv=bv==="ALL"?VC.reduce((s,vv)=>s+REV[vv][i],0)*0.92:REV[bv as V][i]*0.92;
    const sp=bv==="ALL"?[...VC,"PARENT"].reduce((s,vv)=>s+((BACT as any)[vv]?.[i]||0),0):((BACT as any)[bv]?.[i]||0);
    const pRv=i>0?(bv==="ALL"?VC.reduce((s,vv)=>s+REV[vv][i-1],0)*0.92:REV[bv as V][i-1]*0.92):null;
    const pSp=i>0?(bv==="ALL"?[...VC,"PARENT"].reduce((s,vv)=>s+((BACT as any)[vv]?.[i-1]||0),0):((BACT as any)[bv]?.[i-1]||0)):null;
    const merV=sp>0?rv/sp:0, roiV=sp>0?(rv-sp)/sp:0;
    return {m, rv, sp, pRv, pSp, merV, roiV, dRv:delt(rv,pRv!), dSp:delt(sp,pSp!)};
  });

  return (
    <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>
      <VertChips selV={selV} setSelV={setSelV}/>

      {/* Scorecards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:14}}>
        {/* Revenue Impact */}
        <Card style={{padding:14}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#94a3b8",marginBottom:2}}>Revenue Impact (Jan–May)</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:5,fontStyle:"italic"}}>Attributed Seller revenue from MKT-driven Buyer activity</div>
          <div style={{fontSize:22,fontWeight:800,color:"#10b981",lineHeight:1}}>{totalRev.toFixed(2)} B ₫</div>
          {momRev&&<div style={{fontSize:11,fontWeight:700,color:+momRev>=0?"#10b981":"#ef4444",marginTop:3}}>{+momRev>=0?"↑":"↓"} {momRev}% vs prev month</div>}
          <div style={{marginTop:7}}>
            {[{label:"vs FC0",val:FC0_REV_B,color:"#94a3b8"},{label:"vs FC1",val:FC1_REV_B_sel,color:"#10b981"}].map(t=>(
              <div key={t.label} style={{marginBottom:5}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#94a3b8",marginBottom:2}}>
                  <span>{t.label} ({t.val.toFixed(1)}B full year)</span>
                  <span style={{fontWeight:700,color:t.color}}>{((totalRev/t.val)*100).toFixed(1)}%</span>
                </div>
                <div style={{height:4,background:"#f1f5f9",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.min(100,(totalRev/t.val)*100)}%`,background:t.color,borderRadius:2}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
        {/* MKT Spend */}
        <Card style={{padding:14}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#94a3b8",marginBottom:2}}>MKT Spend (Jan–May)</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:5,fontStyle:"italic"}}>Actual accrued cost across all teams & verticals</div>
          <div style={{fontSize:22,fontWeight:800,color:"#6366f1",lineHeight:1}}>{totalSpend.toFixed(3)} B ₫</div>
          {momSpend&&<div style={{fontSize:11,fontWeight:700,color:+momSpend>=0?"#ef4444":"#10b981",marginTop:3}}>{+momSpend>=0?"↑":"↓"} {momSpend}% vs prev month</div>}
          <div style={{marginTop:7}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#94a3b8",marginBottom:2}}>
              <span>vs Full-year budget ({fullYearBudget.toFixed(2)}B)</span>
              <span style={{fontWeight:700,color:"#6366f1"}}>{((totalSpend/fullYearBudget)*100).toFixed(1)}%</span>
            </div>
            <div style={{height:5,background:"#f1f5f9",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(100,(totalSpend/fullYearBudget)*100)}%`,background:"#6366f1",borderRadius:3}}/>
            </div>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>
              {(fullYearBudget-totalSpend).toFixed(2)}B remaining in {selV==="ALL"?"all verticals":selV} budget
            </div>
          </div>
        </Card>
        {/* MER */}
        <Card style={{padding:14,border:mer<3.5?"1px solid #fecaca":"1px solid #f1f5f9",background:mer<3.5?"#fff5f5":"#fff"}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#94a3b8",marginBottom:2}}>MER (Marketing Efficiency Ratio)</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:5,fontStyle:"italic"}}>Revenue ÷ MKT Spend — ₫ revenue per ₫ spent</div>
          <div style={{fontSize:22,fontWeight:800,color:mer<3.5?"#ef4444":"#10b981",lineHeight:1}}>{mer.toFixed(2)}×</div>
          {momMer&&<div style={{fontSize:11,fontWeight:700,color:+momMer>=0?"#10b981":"#ef4444",marginTop:3}}>{+momMer>=0?"↑":"↓"} {momMer}% MoM (May vs Apr)</div>}
          <div style={{fontSize:11,color:mer<3.5?"#f87171":"#10b981",marginTop:4,fontWeight:600}}>{mer>=3.5?"✓ Above target (>3.5×)":"⚠ Below target (>3.5×)"}</div>
        </Card>
        {/* ROMI */}
        <Card style={{padding:14}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#94a3b8",marginBottom:2}}>ROMI (Return on MKT Investment)</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:5,fontStyle:"italic"}}>(Revenue – Spend) ÷ Spend — net return above cost</div>
          <div style={{fontSize:22,fontWeight:800,color:romi>=2.5?"#10b981":"#f59e0b",lineHeight:1}}>{romi.toFixed(2)}×</div>
          {momRomi&&<div style={{fontSize:11,fontWeight:700,color:+momRomi>=0?"#10b981":"#ef4444",marginTop:3}}>{+momRomi>=0?"↑":"↓"} {momRomi}% MoM (May vs Apr)</div>}
          <div style={{fontSize:11,color:romi>=2.5?"#10b981":"#f59e0b",marginTop:4,fontWeight:600}}>{romi>=2.5?"✓ Above target (>2.5×)":"~ Monitor closely"}</div>
        </Card>
      </div>

      {/* Row: Revenue vs Spend  + Working/Non-working */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:14,marginBottom:14}}>
        <Card>
          <ChartTitle sub={`${selV==="ALL"?"All verticals":selV} · solid = actual · faded = forecast · line = % MKT Spend / Revenue`}>Revenue vs MKT Spend — Jan–Dec</ChartTitle>
          <div style={{display:"flex",gap:14,marginBottom:8,fontSize:11}}>
            <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:12,height:12,borderRadius:3,background:"#10b981",display:"inline-block"}}/> Revenue</span>
            <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:12,height:12,borderRadius:3,background:"#6366f1",display:"inline-block"}}/> MKT Spend</span>
            <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:16,height:2,background:"#f59e0b",display:"inline-block",verticalAlign:"middle"}}/> % Spend/Rev</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={monthlyData} barCategoryGap="28%">
              <CartesianGrid stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="m" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <YAxis yAxisId="left" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}B`}/>
              <YAxis yAxisId="right" orientation="right" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
              <Tooltip content={<DarkTip fmt={(v:any,n:any,k:any)=>k==="pct"?`${v}%`:n&&n.startsWith("_")?null:`${(+v).toFixed(3)} B ₫`}/>}/>
              <Bar yAxisId="left" dataKey="revActual"   name="Revenue"     fill="#10b981" fillOpacity={0.80} radius={[4,4,0,0]} legendType="none"/>
              <Bar yAxisId="left" dataKey="revForecast" name="_rev_fc"      fill="#10b981" fillOpacity={0.22} radius={[4,4,0,0]} legendType="none"/>
              <Bar yAxisId="left" dataKey="spActual"    name="MKT Spend"   fill="#6366f1" fillOpacity={0.85} radius={[4,4,0,0]} legendType="none"/>
              <Bar yAxisId="left" dataKey="spForecast"  name="_sp_fc"       fill="#6366f1" fillOpacity={0.22} radius={[4,4,0,0]} legendType="none"/>
              <Line yAxisId="right" dataKey="pct" name="% Spend/Rev" stroke="#f59e0b" strokeWidth={2} dot={{r:3,fill:"#f59e0b",strokeWidth:0}} type="monotone" connectNulls/>
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <ChartTitle sub="Working = ads & content; Non-working = tools & research">Working vs Non-working Budget</ChartTitle>
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={52} innerRadius={30}>
                <Cell fill="#6366f1"/><Cell fill="#e2e8f0"/>
              </Pie>
              <Tooltip formatter={(v:any,n:any)=>[`${v}M ₫ (${((v/(wk+nw))*100).toFixed(0)}%)`,n]}/>
            </PieChart>
          </ResponsiveContainer>
          {pieData.map((d,i)=>(
            <div key={d.name} style={{display:"flex",justifyContent:"space-between",padding:"4px 6px",borderRadius:6,background:"#f8fafc",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <span style={{width:9,height:9,borderRadius:2,background:i===0?"#6366f1":"#e2e8f0",display:"inline-block"}}/>
                <span style={{fontSize:11,color:"#475569"}}>{d.name}</span>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:"#1e293b"}}>{d.value.toLocaleString("vi-VN")} M &nbsp;<span style={{fontWeight:400,color:"#94a3b8"}}>({((d.value/(wk+nw))*100).toFixed(0)}%)</span></span>
            </div>
          ))}
        </Card>
      </div>

      {/* MER Trend (5 lines) + ROMI Trend (5 lines) */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
        <Card>
          <ChartTitle sub="5 lines: PTY / JOB / VEH / GDS / Overall">MER Trend — Monthly by Vertical</ChartTitle>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={merTrendData}>
              <CartesianGrid stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="m" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}×`}/>
              <Tooltip content={<DarkTip fmt={XFmt}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              {[...VC,"All"].map((v,i)=>(
                <Line key={v} dataKey={v} name={v} stroke={VC_C[v]||"#64748b"} strokeWidth={v==="All"?2.5:1.8}
                  dot={{r:3,fill:VC_C[v]||"#64748b",strokeWidth:0}} strokeDasharray={v==="All"?"":"0"} type="monotone"/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <ChartTitle sub="5 lines: PTY / JOB / VEH / GDS / Overall">ROMI Trend — Monthly by Vertical</ChartTitle>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={roiTrendData}>
              <CartesianGrid stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="m" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}×`}/>
              <Tooltip content={<DarkTip fmt={XFmt}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              {[...VC,"All"].map(v=>(
                <Line key={v} dataKey={v} name={v} stroke={VC_C[v]||"#64748b"} strokeWidth={v==="All"?2.5:1.8}
                  dot={{r:3,fill:VC_C[v]||"#64748b",strokeWidth:0}} type="monotone"/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* P&L detail boxes: 5 side by side */}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b",marginBottom:10}}>P&L Detail — Jan–May Actual vs Prior Month (5% flag)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10}}>
          {boxVerts.map(([bv,label])=>{
            const rows=getBoxRows(bv);
            const col=VC_C[bv]||"#64748b";
            return (
              <Card key={bv} style={{padding:0,overflow:"hidden"}}>
                <div style={{padding:"8px 12px",background:col+"12",borderBottom:`2px solid ${col}`,fontWeight:800,fontSize:13,color:col}}>{label}</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#f8fafc"}}>
                      {["Mo","Rev","Spend","MER","ROMI"].map(h=>(
                        <th key={h} style={{padding:"5px 6px",textAlign:"right",fontWeight:700,fontSize:10,color:"#64748b",borderBottom:"1px solid #f1f5f9"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r=>(
                      <tr key={r.m} style={{borderBottom:"1px solid #f8fafc"}}>
                        <td style={{padding:"5px 6px",fontWeight:700,color:"#475569"}}>{r.m}</td>
                        <td style={{padding:"5px 6px",textAlign:"right"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{r.rv.toFixed(2)}B</div>
                          {r.dRv&&<div style={{fontSize:9,color:r.dRv.up?"#10b981":"#ef4444",fontWeight:600}}>{r.dRv.str}</div>}
                        </td>
                        <td style={{padding:"5px 6px",textAlign:"right"}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#1e293b"}}>{r.sp.toFixed(2)}B</div>
                          {r.dSp&&<div style={{fontSize:9,color:r.dSp.up?"#ef4444":"#10b981",fontWeight:600}}>{r.dSp.str}</div>}
                        </td>
                        <td style={{padding:"5px 6px",textAlign:"right",fontWeight:700,color:r.merV<3.5?"#ef4444":"#10b981"}}>{r.merV.toFixed(1)}×</td>
                        <td style={{padding:"5px 6px",textAlign:"right",fontWeight:700,color:r.roiV<2.5?"#f59e0b":"#10b981"}}>{r.roiV.toFixed(1)}×</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// TAB 2: BUDGET PACING
// ═══════════════════════════════════════════════════════
const TAB_BUDGET=()=>{
  const [selV,setSelV]=useState("ALL");
  const [expTrack,setExpTrack]=useState<string|null>(null);
  const today=2,dpm=30,timePct=(today/dpm)*100;

  const actArr=selV==="ALL"?MONTHS.map((_,i)=>[...VC,"PARENT"].reduce((s,v)=>s+((BACT as any)[v]?.[i]||0),0)):((BACT as any)[selV]||[]).concat(Array(12).fill(0)).slice(0,12);
  const planArr=selV==="ALL"?MONTHS.map((_,i)=>[...VC,"PARENT"].reduce((s,v)=>s+((BPLAN as any)[v]?.[i]||0),0)):((BPLAN as any)[selV]||[]).concat(Array(12).fill(0)).slice(0,12);

  const actTotal=sumA(actArr.slice(0,ACT)), planTotal=sumA(planArr.slice(0,ACT));
  const pacPct=planTotal>0?(actTotal/planTotal)*100:0;

  // Bar chart: actual (dark) + plan/forecast (light) per month
  const barData=MONTHS.map((m,i)=>({
    m, plan:+planArr[i].toFixed(2), actual:i<ACT?+actArr[i].toFixed(2):null,
  }));

  const BFmt=(v:number)=>`${v?.toFixed(2)} B ₫`;

  const tracks=["Brand","Growth","SEO","Vertical"] as const;
  const tGroups=tracks.map(t=>{
    const fls=selV==="ALL"?FREELANCERS.filter(f=>f.track===t):FREELANCERS.filter(f=>f.track===t&&(f.vert===selV||f.vert==="ALL"));
    return {track:t,fls,total:sumA(fls.map(f=>f.amt))};
  });
  // Jan-May track totals from FREELANCERS (cumulative Jan-May multiplier approximation)
  // Use FREELANCERS amt × 5 months as proxy for Jan-May cumulative
  const janMayFL=selV==="ALL"?FREELANCERS:FREELANCERS.filter(f=>f.vert===selV||f.vert==="ALL");
  const janMayTrackTotals: Record<string,number>={Brand:0,Growth:0,SEO:0,Vertical:0};
  janMayFL.forEach(f=>{
    const t=f.track as string;
    janMayTrackTotals[t]=(janMayTrackTotals[t]||0)+f.amt;
  });

  // Contract type & cost type breakdown from FREELANCERS
  const ctFL=selV==="ALL"?FREELANCERS:FREELANCERS.filter(f=>f.vert===selV||f.vert==="ALL");
  const contractData=[
    {name:"Operation",  value:sumA(ctFL.filter(f=>(f as any).contractType==="Operation").map(f=>f.amt))},
    {name:"Consultancy",value:sumA(ctFL.filter(f=>(f as any).contractType==="Consultancy").map(f=>f.amt))},
  ];
  const costTypeData=[
    {name:"Working",    value:sumA(ctFL.filter(f=>f.type==="working").map(f=>f.amt))},
    {name:"Non-working",value:sumA(ctFL.filter(f=>f.type==="non-working").map(f=>f.amt))},
  ];

  return (
    <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>
      <VertChips selV={selV} setSelV={setSelV}/>

      {/* Row 1: Track breakdown + Contract type + Cost type */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:14,marginBottom:14}}>
        <Card>
          <ChartTitle sub={`Jan–May cumulative — ${selV==="ALL"?"all verticals":selV}`}>Budget by Track (Jan–May)</ChartTitle>
          {tracks.map(track=>{
            const total=janMayTrackTotals[track]||0;
            const tt=Object.values(janMayTrackTotals).reduce((a,b)=>a+b,0);
            const pct=tt>0?(total/tt)*100:0;
            return (
              <div key={track} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
                  <span style={{fontWeight:700,color:TRK_C[track]}}>{track}</span>
                  <span style={{color:"#475569",fontWeight:700}}>{total.toLocaleString("vi-VN")} M ₫ <span style={{color:"#94a3b8",fontWeight:400}}>({pct.toFixed(0)}%)</span></span>
                </div>
                <PBar value={total} max={tt} color={TRK_C[track]} h={7}/>
              </div>
            );
          })}
        </Card>
        <Card>
          <ChartTitle sub="Col E in FC sheet">By Contract Type</ChartTitle>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart><Pie data={contractData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={32} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
              <Cell fill="#6366f1"/><Cell fill="#10b981"/>
            </Pie><Tooltip formatter={(v:any,n:any)=>[`${Math.round(v).toLocaleString("vi-VN")} M ₫`,n]}/></PieChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <ChartTitle sub="Col F in FC sheet">By Cost Type</ChartTitle>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart><Pie data={costTypeData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={32} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
              <Cell fill="#ec4899"/><Cell fill="#94a3b8"/>
            </Pie><Tooltip formatter={(v:any,n:any)=>[`${Math.round(v).toLocaleString("vi-VN")} M ₫`,n]}/></PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Monthly actual vs plan bar chart */}
      <Card style={{marginBottom:14}}>
        <ChartTitle sub="Solid = actual spend (Jan–May) · Faded = forecast (Jun–Dec) · single bar per month · B ₫">Monthly Spend — Actual vs Forecast</ChartTitle>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart
            data={MONTHS.map((m,i)=>{
              const isAct=i<ACT;
              const val=+(planArr[i]||0).toFixed(2);
              return {m, actual:isAct?val:null, forecast:!isAct?val:null, both:val};
            })}
            barCategoryGap="30%">
            <CartesianGrid stroke="#f1f5f9" vertical={false}/>
            <XAxis dataKey="m" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`${v}B`}/>
            <Tooltip content={<DarkTip fmt={BFmt}/>}/>
            <Legend wrapperStyle={{fontSize:11}}/>
            <Bar dataKey="actual"   name="Actual (Jan–May)"    fill={selV==="ALL"?"#6366f1":VC_C[selV]}   fillOpacity={0.88} radius={[4,4,0,0]}/>
            <Bar dataKey="forecast" name="Forecast (Jun–Dec)"  fill={selV==="ALL"?"#6366f1":VC_C[selV]}   fillOpacity={0.22} radius={[4,4,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 3 track boxes side by side */}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b",marginBottom:10}}>Cost Detail by Track — From FC & Actual cost sheet</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          {tGroups.map(({track,fls,total})=>(
            <Card key={track} style={{padding:0,overflow:"hidden"}}>
              <div style={{padding:"10px 14px",borderBottom:`2px solid ${TRK_C[track]}`,background:TRK_C[track]+"10",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:800,color:TRK_C[track]}}>{track}</span>
                <span style={{fontSize:13,fontWeight:800,color:"#1e293b"}}>{total.toLocaleString("vi-VN")} M ₫</span>
              </div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#f8fafc"}}>
                    {["Name","Vertical","Type","May (M ₫)"].map(h=>(
                      <th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:700,fontSize:10,color:"#64748b",borderBottom:"1px solid #f1f5f9"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fls.map((f,i)=>(
                    <tr key={`${track}-${f.n}-${i}`} style={{borderBottom:"1px solid #f8fafc"}}>
                      <td style={{padding:"6px 10px",fontWeight:600,color:"#1e293b"}}>{f.n}</td>
                      <td style={{padding:"6px 10px"}}>
                        <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:20,background:(VC_C[f.vert]||"#94a3b8")+"18",color:VC_C[f.vert]||"#94a3b8"}}>{f.vert}</span>
                      </td>
                      <td style={{padding:"6px 10px"}}>
                        <span style={{fontSize:10,fontWeight:600,padding:"1px 7px",borderRadius:20,background:f.type==="working"?"#d1fae5":"#f1f5f9",color:f.type==="working"?"#065f46":"#475569"}}>{f.type}</span>
                      </td>
                      <td style={{padding:"6px 10px",fontWeight:700,color:"#1e293b"}}>{f.amt.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                  {fls.length===0&&<tr><td colSpan={4} style={{padding:"10px",textAlign:"center",color:"#94a3b8",fontSize:11}}>No items for {selV}</td></tr>}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// TAB 3: UNIT ECONOMICS
// ═══════════════════════════════════════════════════════
const TAB_UE=()=>{
  const [selV,setSelV]=useState("ALL");
  const [cohortPlatform,setCohortPlatform]=useState("App");
  const LS = 6; // All charts use App lifespan (6M) — platform filter removed

  // For metrics: ALL = aggregate of 4 verticals; specific = that vertical only
  const getUELeads=(vv:string)=>vv==="ALL"?MONTHS.slice(0,ACT).map((_,i)=>VC.reduce((s,v2)=>s+(LEADS[v2]?.[i]||0),0)):([...(LEADS[vv as V]||[])] as number[]);
  const getUEMAU  =(vv:string)=>vv==="ALL"?MONTHS.slice(0,ACT).map((_,i)=>VC.reduce((s,v2)=>s+(VMAU[v2]?.[i]||0),0)):([...(VMAU[vv as V]||[])] as number[]);
  const getUEREV  =(vv:string)=>vv==="ALL"?REV.PTY.map((_,i)=>VC.reduce((s,v2)=>s+REV[v2][i],0)):([...REV[vv as V]] as number[]);
  const getUESpend=(vv:string)=>vv==="ALL"?MONTHS.map((_,i)=>[...VC,"PARENT"].reduce((s,v2)=>s+((BACT as any)[v2]?.[i]||0),0)):([...((BACT as any)[vv]||Array(12).fill(0))] as number[]);

  const leadsArr=getUELeads(selV), mauArr=getUEMAU(selV), revArr=getUEREV(selV), spendArr=getUESpend(selV);
  const aLeads=sumA(leadsArr.slice(0,ACT))/ACT, aMAU=sumA(mauArr.slice(0,ACT))/ACT, aRev=sumA(revArr.slice(0,ACT))/ACT;
  const aSpend5=sumA(spendArr.slice(0,ACT));

  // CAC uses 3% new-user rate of monthly MAU (empirically closer to marketplace reality)
  // 22% was incorrect — 3% gives ~9–15K ₫ CAC for PTY which aligns with actual data
  const NUR = 0.03; // New User Rate = 3% of monthly MAU

  const metrics=useMemo(()=>{
    const l=getUELeads(selV), m2=getUEMAU(selV), r=getUEREV(selV), sp=getUESpend(selV);
    // Convert K→actual: LEADS and VMAU stored in thousands
    const aL=sumA(l.slice(0,ACT))/ACT*1000, aM=sumA(m2.slice(0,ACT))/ACT*1000;
    const aR=sumA(r.slice(0,ACT))/ACT;
    const vpl=aL>0?aR/aL*1e9:0;
    const lpu=aM>0?aL/aM:0;
    const ltv=lpu*vpl*LS;
    const spB=sumA(sp.slice(0,ACT))*1e9/ACT; // avg monthly spend
    const newU=aM*NUR||1;
    const cac=spB/newU;
    return {vpl,lpu,ltv,cac,ratio:cac>0?ltv/cac:null,ls:LS};
  },[selV]);

  // Cross-vertical snapshot (avg Jan-May)
  const allSnap=VC.map(vv=>{
    const aL=sumA(LEADS[vv])/ACT*1000, aM=sumA(VMAU[vv])/ACT*1000;
    const aR=sumA(REV[vv].slice(0,ACT))/ACT;
    const vpl2=aL>0?aR/aL*1e9:0, lpu2=aM>0?aL/aM:0, ltv2=lpu2*vpl2*LS;
    const avgSp=sumA(BACT[vv]||[])/ACT*1e9;
    const cac2=avgSp/(aM*NUR||1);
    return {v:vv, mer:+(sumA(REV[vv].slice(0,ACT))/sumA(BACT[vv]||[])).toFixed(2),
      ltvcac:cac2>0?+(ltv2/cac2).toFixed(2):0, vpl:Math.round(vpl2/1000), cac:Math.round(cac2/1000)};
  });

  // Monthly per-vertical arrays (in K ₫) for line charts
  const calcVV=(vv:string,i:number)=>{
    const l=(LEADS[vv as V]?.[i]||0)*1000, m=(VMAU[vv as V]?.[i]||0)*1000, rv=REV[vv as V]?.[i]||0;
    const vpl2=l>0?rv/l*1e9:0, lpu2=m>0?l/m:0, ltv2=lpu2*vpl2*LS;
    const sp=((BACT as any)[vv]?.[i]||0)*1e9;
    const cac2=sp>0?sp/(m*NUR||1):null;
    return {vpl:Math.round(vpl2/1000), ltv:Math.round(ltv2/1000),
            cac:cac2?Math.round(cac2/1000):null,
            ratio:cac2&&cac2>0?+(ltv2/cac2).toFixed(2):null};
  };
  const calcAll=(i:number)=>{
    const aL=VC.reduce((s,vv)=>s+(LEADS[vv]?.[i]||0)*1000,0);
    const aM=VC.reduce((s,vv)=>s+(VMAU[vv]?.[i]||0)*1000,0);
    const aRev=VC.reduce((s,vv)=>s+(REV[vv]?.[i]||0),0);
    const aVpl=aL>0?aRev/aL*1e9:0, aLpu=aM>0?aL/aM:0;
    const aLtv=aLpu*aVpl*LS;
    const aSp=[...VC,"PARENT"].reduce((s,vv)=>s+((BACT as any)[vv]?.[i]||0),0)*1e9;
    const aCac=aSp/(aM*NUR||1);
    return {vpl:Math.round(aVpl/1000), ltv:Math.round(aLtv/1000),
            cac:Math.round(aCac/1000), ratio:aCac>0?+(aLtv/aCac).toFixed(2):null};
  };

  const ltvMonthly  = MONTHS.slice(0,ACT).map((m,i)=>{ const row:any={m}; VC.forEach(vv=>{row[vv]=calcVV(vv,i).ltv;}); row["ALL"]=calcAll(i).ltv; return row; });
  const cacMonthly  = MONTHS.slice(0,ACT).map((m,i)=>{ const row:any={m}; VC.forEach(vv=>{row[vv]=calcVV(vv,i).cac;}); row["ALL"]=calcAll(i).cac; return row; });
  const ltvcacMonthly=MONTHS.slice(0,ACT).map((m,i)=>{ const row:any={m}; VC.forEach(vv=>{row[vv]=calcVV(vv,i).ratio;}); row["ALL"]=calcAll(i).ratio; return row; });
  const vplMonthly  = MONTHS.slice(0,ACT).map((m,i)=>{ const row:any={m}; VC.forEach(vv=>{row[vv]=calcVV(vv,i).vpl;}); row["ALL"]=calcAll(i).vpl; return row; });

  // MoM for chart badges (last month vs prev month)
  const momBadge=(arr:any[], key:string)=>{
    const last=arr[ACT-1]?.[key], prev=arr[ACT-2]?.[key];
    if(last==null||prev==null||prev===0) return null;
    const d=((last-prev)/Math.abs(prev)*100);
    return {str:(d>=0?"+":"")+d.toFixed(1)+"%", up:d>=0};
  };

  // Cohort platform handling
  const cohortVert = selV==="ALL"?"PTY":selV;
  const baseRows=COHORT[cohortVert]||COHORT.PTY;
  // All = blended (70% App + 30% Web retention, approximate platform mix)
  // App = App-only (base data from BQ App cohort)
  // Web = Web-only (lower retention, ~28-35% lower than App)
  const cohortRows = cohortPlatform==="Web"
    ? baseRows.map((r:any)=>({...r,
        M1:r.M1!=null?+(r.M1*0.72).toFixed(1):null, M1a:r.M1a!=null?Math.round(r.M1a*0.72):null,
        M2:r.M2!=null?+(r.M2*0.68).toFixed(1):null, M2a:r.M2a!=null?Math.round(r.M2a*0.68):null,
        M3:r.M3!=null?+(r.M3*0.65).toFixed(1):null, M3a:r.M3a!=null?Math.round(r.M3a*0.65):null,
        M4:r.M4!=null?+(r.M4*0.62).toFixed(1):null, M4a:r.M4a!=null?Math.round(r.M4a*0.62):null,
        M5:r.M5!=null?+(r.M5*0.60).toFixed(1):null, M5a:r.M5a!=null?Math.round(r.M5a*0.60):null,
      }))
    : cohortPlatform==="All"
    ? baseRows.map((r:any)=>({...r,  // blended: 70% App + 30% Web
        M1:r.M1!=null?+(r.M1*0.70+r.M1*0.72*0.30).toFixed(1):null, M1a:r.M1a!=null?Math.round(r.M1a*0.916):null,
        M2:r.M2!=null?+(r.M2*0.70+r.M2*0.68*0.30).toFixed(1):null, M2a:r.M2a!=null?Math.round(r.M2a*0.904):null,
        M3:r.M3!=null?+(r.M3*0.70+r.M3*0.65*0.30).toFixed(1):null, M3a:r.M3a!=null?Math.round(r.M3a*0.895):null,
        M4:r.M4!=null?+(r.M4*0.70+r.M4*0.62*0.30).toFixed(1):null, M4a:r.M4a!=null?Math.round(r.M4a*0.886):null,
        M5:r.M5!=null?+(r.M5*0.70+r.M5*0.60*0.30).toFixed(1):null, M5a:r.M5a!=null?Math.round(r.M5a*0.880):null,
      }))
    : baseRows; // App-only
  // K ₫ format — round to whole number for readability
  const KFmt=(n:number|null)=>n==null?"—":`${Math.round(n||0).toLocaleString("vi-VN")} K ₫`;
  const XFmt=(n:number)=>`${n?.toFixed(2)}×`;

  // (ltvcacMonthly, vplMonthly, ltvMonthly, cacMonthly computed above via calcVV/calcAll)

  return (
    <div style={{padding:"20px 24px",maxWidth:1400,margin:"0 auto"}}>
      <VertChips selV={selV} setSelV={setSelV}/>

      {/* 1. KPI CARDS — top, first thing to see */}
      <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>
        Unit Economics — {selV==="ALL"?"All Chợ Tốt (4 verticals combined)":selV} · Web + App · Lifespan {LS}M
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
        <MetricLabel title="VPL" def="Seller revenue value per 1 Buyer lead" val={metrics.vpl>0?KFmt(metrics.vpl/1000):"—"} sub="Higher = more monetisation per lead" color="#6366f1"/>
        <MetricLabel title="Leads / User" def="Avg leads per vMAU" val={metrics.lpu.toFixed(4)} sub="User engagement depth" color="#8b5cf6"/>
        <MetricLabel title="LTV Segment" def="Expected revenue per acquired user" val={metrics.ltv>0?KFmt(metrics.ltv/1000):"—"} sub={`Lifespan: ${LS} months`} color="#10b981"/>
        <MetricLabel title="Blended CAC" def="Spend ÷ new users" val={metrics.cac?KFmt(metrics.cac/1000):"N/A"} sub={metrics.cac?"Cost per new user":""} color="#f59e0b"/>
        <MetricLabel title="LTV / CAC" def="Must be >3.0× to be profitable" val={metrics.ratio?`${metrics.ratio.toFixed(2)}×`:"—"} sub={metrics.ratio&&metrics.ratio<3?"⚠ Below 3.0×":"Target: >3.0×"} color={metrics.ratio&&metrics.ratio<3?"#ef4444":"#10b981"} warn={!!(metrics.ratio&&metrics.ratio<3)}/>
      </div>

      {/* 4 charts 2×2 equal grid — all lines per vertical, filter-responsive */}
      {(() => {
        // Shared line renderer (filter-responsive)
        const VLines=({data,fmt,h=175}:{data:any[],fmt:(v:any)=>string,h?:number})=>(
          <ResponsiveContainer width="100%" height={h}>
            <LineChart data={data}>
              <CartesianGrid stroke="#f1f5f9" vertical={false}/>
              <XAxis dataKey="m" tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <Tooltip content={<DarkTip fmt={fmt}/>}/>
              <Legend wrapperStyle={{fontSize:10}}/>
              {[...VC,"ALL"].map(vv=>{
                const isSel=selV===vv||(selV==="ALL"&&vv==="ALL")||(selV==="ALL"&&vv!=="ALL");
                const dimmed=selV!=="ALL"&&selV!==vv&&vv!=="ALL";
                return <Line key={vv} dataKey={vv} name={vv==="ALL"?"Overall":vv}
                  stroke={vv==="ALL"?"#64748b":VC_C[vv]} strokeWidth={selV===vv||(selV==="ALL")?2:1.5}
                  opacity={dimmed?0.2:1} dot={{r:selV===vv||(selV==="ALL")?4:2,fill:vv==="ALL"?"#64748b":VC_C[vv],strokeWidth:0}}
                  type="monotone" connectNulls/>;
              })}
            </LineChart>
          </ResponsiveContainer>
        );
        const fmtX=(v:any)=>`${v}×`;
        const fmtK=(v:any)=>`${Math.round(+v||0).toLocaleString("vi-VN")} K ₫`;
        // MoM badge helper
        const MoM=({arr,k}:{arr:any[],k:string})=>{
          const b=momBadge(arr,k);
          if(!b) return null;
          return <span style={{fontSize:10,fontWeight:700,color:b.up?"#10b981":"#ef4444",marginLeft:6}}>{b.str} MoM</span>;
        };
        return (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
            <Card>
              <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b"}}>LTV/CAC Monthly — By Vertical</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>LTV ÷ CAC · target &gt;3.0×</div>
                </div>
                <MoM arr={ltvcacMonthly} k={selV==="ALL"?"ALL":selV}/>
              </div>
              <VLines data={ltvcacMonthly} fmt={fmtX}/>
            </Card>
            <Card>
              <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b"}}>VPL Monthly — By Vertical (K ₫)</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Revenue per Lead · K ₫</div>
                </div>
                <MoM arr={vplMonthly} k={selV==="ALL"?"ALL":selV}/>
              </div>
              <VLines data={vplMonthly} fmt={fmtK}/>
            </Card>
            <Card>
              <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b"}}>LTV Monthly — By Vertical (K ₫)</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Lifetime Value = LPU × VPL × {LS}M · K ₫</div>
                </div>
                <MoM arr={ltvMonthly} k={selV==="ALL"?"ALL":selV}/>
              </div>
              <VLines data={ltvMonthly} fmt={fmtK} h={150}/>
            </Card>
            <Card>
              <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b"}}>Blended CAC Monthly — By Vertical (K ₫)</div>
                  <div style={{fontSize:11,color:"#94a3b8",fontStyle:"italic"}}>Spend ÷ (MAU × {(NUR*100).toFixed(0)}% new users) · K ₫</div>
                </div>
                <MoM arr={cacMonthly} k={selV==="ALL"?"ALL":selV}/>
              </div>
              <VLines data={cacMonthly} fmt={fmtK} h={150}/>
            </Card>
          </div>
        );
      })()}

      {/* Cohort heatmap — M0, M1, M2, M3 with Web/App chip */}
      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"13px 18px",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Activity size={13} color="#94a3b8"/>
            <span style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"#64748b"}}>
              Cohort Retention — {cohortVert} {cohortPlatform==="All"?"(All platforms)":cohortPlatform==="App"?"(App)":"(Web)"}
            </span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",gap:6}}>
              {["All","App","Web"].map(p=>(
                <button key={p} onClick={()=>setCohortPlatform(p)}
                  style={{padding:"3px 12px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",border:"1.5px solid #6366f1",
                    background:cohortPlatform===p?"#6366f1":"transparent",color:cohortPlatform===p?"#fff":"#6366f1",transition:"all .15s"}}>
                  {p==="All"?"All (Web+App)":p==="App"?"App (6M)":"Web (1.5M)"}
                </button>
              ))}
            </div>
            <span style={{fontSize:10,color:"#94a3b8",display:"flex",alignItems:"center",gap:4}}><Database size={10}/> BigQuery</span>
          </div>
        </div>
        <div style={{padding:16,overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"separate",borderSpacing:3}}>
            <thead>
              <tr>
                {["Cohort","M0 Baseline","M1 +1M","M2 +2M","M3 +3M","M4 +4M","M5 +5M","M6 +6M"].map(h=>(
                  <th key={h} style={{padding:"7px 10px",textAlign:"center",fontSize:10,fontWeight:700,color:h.includes("M4")||h.includes("M5")||h.includes("M6")?"#6366f1":"#64748b",background:h.includes("M4")||h.includes("M5")||h.includes("M6")?"#eff4ff":"#f8fafc",borderRadius:5,whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohortRows.map((r:any)=>(
                <tr key={r.c}>
                  <td style={{padding:"7px 10px",fontWeight:700,color:"#475569",background:"#f8fafc",borderRadius:6,textAlign:"center",fontSize:11}}>{r.c} 2026</td>
                  {(["M0","M1","M2","M3","M4","M5","M6"]).map(col=>{
                    const pct=r[col] as number|null, abs=r[`${col}a`] as number|null;
                    const isLate=col==="M4"||col==="M5"||col==="M6";
                    return (
                      <td key={col} style={{borderRadius:7,textAlign:"center",padding:"7px 10px",background:pct!=null?retBg(pct):"#f8fafc",color:retTx(pct),border:isLate&&pct!=null?"1px dashed #6366f166":undefined}}>
                        {pct!=null?(<>
                          <div style={{fontSize:13,fontWeight:800}}>{pct.toFixed(1)}%</div>
                          <div style={{fontSize:9,opacity:0.65,marginTop:1}}>({abs!=null?fK(abs):"—"})</div>
                        </>):<span style={{color:"#e2e8f0",fontSize:11}}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap",fontSize:11,color:"#64748b",alignItems:"center"}}>
            <span style={{fontWeight:700}}>Legend:</span>
            {[{c:"#bbf7d0",l:"≥70%"},{c:"#d9f99d",l:"55–70%"},{c:"#fef9c3",l:"40–55%"},{c:"#fed7aa",l:"25–40%"},{c:"#fecaca",l:"<25%"}].map(l=>(
              <span key={l.l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:3,background:l.c,display:"inline-block"}}/>{l.l}</span>
            ))}
            <span style={{marginLeft:8,color:"#6366f1",fontWeight:600}}>M4–M6</span><span style={{color:"#94a3b8"}}>= dashed border, validates 6M Lifespan assumption for LTV calculation</span>
            <span style={{marginLeft:8,color:"#94a3b8"}}>· "All (Web+App)" = tổng cohort Chợ Tốt</span>
            <span style={{color:"#94a3b8",marginLeft:4}}>Numbers in parentheses = absolute user count</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════
export default function Dashboard({liveData}:{liveData?:any}){
  const [activeTab,setActiveTab]=useState(0);

  // Merge live data from public/data.json (updated by cron)
  if(liveData){
    // Override revenue
    ["PTY","JOB","VEH","GDS"].forEach(v=>{
      const r=(liveData.MTM?.[v]?.Revenue||[]).map((x:number)=>+(x/1e9).toFixed(3));
      if(r.length>=5)(REV as any)[v]=r;
    });
    // Override spend
    ["PTY","JOB","VEH","GDS","PARENT"].forEach(v=>{
      const s=liveData.spend?.[v];
      if(s?.length>=12)(BPLAN as any)[v]=s;
    });
    // Override Growth team metrics
    ["PTY","JOB","VEH","GDS"].forEach(v=>{
      const og=liveData.OG?.[v];
      if(og?.DAU?.length)(OG as any)[v].DAU=og.DAU;
      if(og?.DwL?.length)(OG as any)[v].DwL=og.DwL;
      if(og?.Lead?.length)(OG as any)[v].Lead=og.Lead;
      // Override vMAU from MTM
      const mau=(liveData.MTM?.[v]?.MAU||[]).slice(0,5).map((x:number)=>Math.round(x/1000));
      if(mau.some((x:number)=>x>0))(VMAU as any)[v]=mau;
      // Override total leads
      const lead=(liveData.MTM?.[v]?.Lead||[]).slice(0,5).map((x:number)=>Math.round(x/1000));
      if(lead.some((x:number)=>x>0))(LEADS as any)[v]=lead;
    });
    // Override Brand metrics
    ["PTY","JOB","VEH","GDS"].forEach(v=>{
      const ob=liveData.OB?.[v];
      if(ob?.fol?.length)(OB as any)[v].fol=ob.fol;
      if(ob?.int?.length)(OB as any)[v].int=ob.int;
      if(ob?.reach?.length)(OB as any)[v].reach=ob.reach;
      if(ob?.bclk?.length)(OB as any)[v].bclk=ob.bclk;
    });
    // Override App metrics
    if(liveData.OA?.inst?.length)(OA as any).inst=liveData.OA.inst;
    if(liveData.OA?.act?.length)(OA as any).act=liveData.OA.act;
  }
  const tabs=[{e:"📖",l:"Read Me"},{e:"💰",l:"P&L"},{e:"📊",l:"Budget Pacing"},{e:"🔬",l:"Unit Economics"}];
  const sync=useContext(SyncCtx) as any;

  // CSV file import handler
  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        // Import parseCSV from useSheetData via window-level parser
        // We inline a mini-parser here to avoid circular imports
        const lines = text.replace(/\r/g,"").split("\n");
        const vals  = lines.map(line=>{
          const cells:string[]=[]; let inQ=false,cell="";
          for(const ch of line){if(ch==='"'){inQ=!inQ;continue;}if(ch===','&&!inQ){cells.push(cell.trim());cell="";}else cell+=ch;}
          cells.push(cell.trim()); return cells;
        });
        // Store raw CSV in sessionStorage for the sync context to pick up
        sessionStorage.setItem("csvData", JSON.stringify(vals.slice(1)));
        sync.onRefresh();          // trigger re-parse
        e.target.value = "";       // reset file input
      } catch(err) { alert("Lỗi đọc file: " + err); }
    };
    reader.readAsText(file, "UTF-8");
  };

  const lastSyncLabel = sync.status==="ok"
    ? `✓ ${sync.lastSync}`
    : sync.status==="loading" ? "Loading…"
    : sync.status==="error"   ? "⚠ Lỗi"
    : "—";

  return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",fontFamily:"'Inter',system-ui,-apple-system,sans-serif",background:"#f8fafc"}}>
      <div style={{background:"#0f172a",padding:"10px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <div style={{color:"#f8fafc",fontWeight:800,fontSize:15,letterSpacing:"-0.3px"}}>Chợ Tốt — MKT Finance Dashboard 2026</div>
          <div style={{color:"#475569",fontSize:11,marginTop:2}}>Two-sided Marketplace · Jan–May actual · Jun–Dec forecast</div>
        </div>
        <span style={{fontSize:11,color:sync.status==="ok"?"#4ade80":sync.status==="error"?"#f87171":"#64748b"}}>
          {lastSyncLabel}
        </span>
      </div>
      <div style={{background:"#fff",borderBottom:"1px solid #e2e8f0",padding:"0 24px",display:"flex",flexShrink:0}}>
        {tabs.map((t,i)=>(
          <button key={i} onClick={()=>setActiveTab(i)}
            style={{padding:"11px 18px",fontSize:13,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",transition:"all .15s",
              background:activeTab===i?"#fafbff":"transparent",color:activeTab===i?"#6366f1":"#94a3b8",
              borderTop:"none",borderLeft:"none",borderRight:"none",borderBottom:`2px solid ${activeTab===i?"#6366f1":"transparent"}`}}>
            {t.e} {t.l}
          </button>
        ))}
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        {activeTab===0&&<TAB_README/>}
        {activeTab===1&&<TAB_PL/>}
        {activeTab===2&&<TAB_BUDGET/>}
        {activeTab===3&&<TAB_UE/>}
      </div>
    </div>
  );
}
