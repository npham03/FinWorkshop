import {executeOdoo} from './odoo.js';
import {businessDate} from './accounting.js';
export const VCB_SOURCE='https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx';
const mappingError=(message)=>Object.assign(new Error(message),{code:'PENDING_MAPPING'});
const key=(companyId,date)=>`fintax.fx.${companyId}.${date}`;

export function parseVcbQuote(xml,baseCurrency='USD',today=businessDate()){
  const stamp=xml.match(/<DateTime>\s*([^<]+)\s*<\/DateTime>/i)?.[1]?.trim();
  const parts=stamp?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if(!parts)throw new Error('Vietcombank trả ngày công bố không hợp lệ.');
  const [,month,day,year]=parts,date=`${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
  if(new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date || date>today)throw new Error('Ngày tỷ giá không hợp lệ hoặc ở tương lai.');
  if(!/^[A-Z]{3}$/.test(baseCurrency))throw new Error('Mã tiền tệ công ty không hợp lệ.');
  const row=xml.match(new RegExp(`<Exrate\\s[^>]*CurrencyCode="${baseCurrency}"[^>]*>`,'i'))?.[0];
  const price=(field)=>{const text=row?.match(new RegExp(`${field}="([\\d,.]+)"`,'i'))?.[1];return text?Number(text.replace(/,/g,'')):NaN;};
  const buy=price('Buy'),transfer=price('Transfer'),sell=price('Sell');
  if(!Number.isFinite(sell)||sell<=0||sell>1000000000||!Number.isFinite(transfer)||transfer<=0||transfer>sell)throw new Error(`Không có tỷ giá ${baseCurrency}/VND hợp lệ từ Vietcombank.`);
  const age=(Date.parse(today)-Date.parse(date))/86400000;
  if(age>7)throw new Error('Tỷ giá Vietcombank đã quá 7 ngày; chưa cập nhật Odoo.');
  return {baseCurrency,date,publishedAt:stamp,side:'SELL',vndPerBaseUnit:sell,buy,transfer,sell,source:VCB_SOURCE};
}
export function validateFxPolicy(policy,vndRate,baseRate,date){
  if(!policy||policy.source!==VCB_SOURCE||policy.side!=='SELL'||policy.date>date)throw mappingError('Chưa có tỷ giá VND đã xác minh cho ngày chứng từ. Cập nhật tỷ giá tại Cài đặt → Tích hợp.');
  const age=(Date.parse(date)-Date.parse(policy.date))/86400000;
  if(!Number.isFinite(age)||age<0||age>7)throw mappingError('Tỷ giá không phù hợp ngày chứng từ hoặc đã quá 7 ngày. Bổ sung tỷ giá đúng kỳ trước khi đồng bộ.');
  const actual=Number(vndRate)/Number(baseRate);
  if(!Number.isFinite(actual)||actual<=0||Math.abs(actual-Number(policy.vndPerBaseUnit))>0.01)throw mappingError('Tỷ giá trong Odoo khác tỷ giá đã xác minh. Cập nhật lại trước khi đồng bộ.');
  return actual;
}
async function approvedRate(company,currencyId,date){
  const rates=await executeOdoo('res.currency.rate','search_read',[[['company_id','=',Number(company.id)],['currency_id','in',[currencyId,company.currency_id[0]]],['name','<=',date]]],{fields:['id','name','rate','currency_id'],order:'name desc',limit:100});
  const vnd=rates.find((row)=>row.currency_id[0]===currencyId),base=rates.find((row)=>row.currency_id[0]===company.currency_id[0]);
  if(!vnd||!base)throw mappingError('Chưa có tỷ giá quy đổi VND cho ngày chứng từ.');
  let policy;try{policy=JSON.parse(await executeOdoo('ir.config_parameter','get_param',[key(company.id,vnd.name),'null']));}catch{throw mappingError('Không đọc được nguồn tỷ giá VND đã xác minh.');}
  validateFxPolicy(policy,vnd.rate,base.rate,date);
  return policy;
}
export async function vndForDocument(company,date=businessDate(),skipRateCheck=false){
  const rows=await executeOdoo('res.currency','search_read',[[['name','=','VND']]],{fields:['id','active'],context:{active_test:false},limit:1});
  if(!rows[0]?.active)throw mappingError('VND chưa được kích hoạt trong Odoo. Chạy cấu hình VND trước khi đồng bộ.');
  const currencyId=Number(rows[0].id);
  const day=String(date||businessDate()).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))throw mappingError('Ngày chứng từ không hợp lệ để tra tỷ giá.');
  if(company.currency_id[0]!==currencyId&&!skipRateCheck)await approvedRate(company,currencyId,day);
  return currencyId;
}
export async function currencyStatus(companyId=null){
  const [company]=await executeOdoo('res.company','search_read',[companyId?[['id','=',companyId]]:[]],{fields:['id','name','currency_id'],limit:1});
  if(!company)return {ready:false,message:'Odoo chưa có công ty.'};
  try{const currencyId=await vndForDocument(company);const policy=company.currency_id[0]===currencyId?null:await approvedRate(company,currencyId,businessDate());return {ready:true,companyId:company.id,companyName:company.name,baseCurrency:company.currency_id[1],documentCurrency:'VND',mode:policy?'MULTICURRENCY':'VND',rate:policy};}
  catch(error){return {ready:false,companyId:company.id,baseCurrency:company.currency_id[1],documentCurrency:'VND',message:error.message};}
}
export async function configureOdooVnd({allowBaseChange=false,companyId=null}={}){
  const [company]=await executeOdoo('res.company','search_read',[companyId?[['id','=',companyId]]:[]],{fields:['id','name','currency_id'],limit:1});
  if(!company)throw new Error('Odoo chưa có công ty.');
  const [vnd]=await executeOdoo('res.currency','search_read',[[['name','=','VND']]],{fields:['id','active'],context:{active_test:false},limit:1});
  if(!vnd)throw new Error('Không tìm thấy tiền tệ VND trong Odoo.');
  // Fetch and validate before mutating any configuration.
  const lines=await executeOdoo('account.move.line','search_count',[[['company_id','=',company.id]]]);
  const canChange=allowBaseChange&&lines===0;
  let quote=null;
  if(company.currency_id[0]!==vnd.id&&!canChange){const response=await fetch(VCB_SOURCE,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Không tải được tỷ giá Vietcombank (${response.status}).`);quote=parseVcbQuote(await response.text(),String(company.currency_id[1]));}
  await executeOdoo('res.currency','write',[[vnd.id],{active:true,rounding:1}]);
  if(canChange&&company.currency_id[0]!==vnd.id)await executeOdoo('res.company','write',[[company.id],{currency_id:vnd.id}]);
  async function rate(currencyId,value){const [existing]=await executeOdoo('res.currency.rate','search_read',[[['company_id','=',company.id],['currency_id','=',currencyId],['name','=',quote.date]]],{fields:['id'],limit:1});const data={company_id:company.id,currency_id:currencyId,name:quote.date,rate:value};if(existing)await executeOdoo('res.currency.rate','write',[[existing.id],data]);else await executeOdoo('res.currency.rate','create',[data]);}
  if(quote){await rate(company.currency_id[0],1);await rate(vnd.id,quote.vndPerBaseUnit);await executeOdoo('ir.config_parameter','set_param',[key(company.id,quote.date),JSON.stringify({...quote,companyId:company.id,configuredAt:new Date().toISOString()})]);}
  const [pricelist]=await executeOdoo('product.pricelist','search_read',[[['currency_id','=',vnd.id],'|',['company_id','=',false],['company_id','=',company.id]]],{fields:['id'],limit:1});
  if(!pricelist)await executeOdoo('product.pricelist','create',[{name:'FinWorkshop · VNĐ',company_id:company.id,currency_id:vnd.id}]);
  return currencyStatus();
}
