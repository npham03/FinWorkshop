import { getWorkshop,DEFAULT_WORKSHOP_ID } from './db.js';
import { executeOdoo } from './odoo.js';
import { transaction } from './workflows.js';
import { businessError } from './accounting.js';

const legacy=new Set(['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002']);
export async function companyForWorkshop(wid){
  wid=wid||DEFAULT_WORKSHOP_ID;
  const workshop=await getWorkshop(wid);
  const id=Number(workshop?.settings?.odooCompanyId||0);
  if(!id&&!legacy.has(wid))throw Object.assign(new Error('Chưa khởi tạo công ty Odoo riêng cho doanh nghiệp.'),{code:'PENDING_MAPPING'});
  const [company]=await executeOdoo('res.company','search_read',[id?[['id','=',id]]:[]],{fields:['id','name','currency_id'],limit:1});
  if(!company)throw Object.assign(new Error('Không tìm thấy công ty Odoo đã ánh xạ.'),{code:'PENDING_MAPPING'});
  return company;
}

export async function provisionCompany(actor){
  if(actor.role!=='OWNER')throw businessError('Chủ doanh nghiệp khởi tạo ERP.',403);
  if(legacy.has(actor.workshopId))return companyForWorkshop(actor.workshopId);
  return transaction(actor.workshopId,async connection=>{
    const [rows]=await connection.query('SELECT name,settings FROM workshops WHERE id=? FOR UPDATE',[actor.workshopId]);
    const workshop=rows[0];if(!workshop)throw businessError('Doanh nghiệp không tồn tại.',404);
    if(workshop.settings?.odooCompanyId)return companyForWorkshop(actor.workshopId);
    const key=`fintax.company.${actor.workshopId}`;
    let id=Number(await executeOdoo('ir.config_parameter','get_param',[key])||0);
    if(!id){
      const [currency]=await executeOdoo('res.currency','search_read',[[['name','=','VND']]],{fields:['id','active'],limit:1,context:{active_test:false}});
      if(!currency)throw businessError('Odoo chưa có tiền tệ VND.',409);
      if(!currency.active)await executeOdoo('res.currency','write',[[currency.id],{active:true}]);
      const [country]=await executeOdoo('res.country','search_read',[[['code','=','VN']]],{fields:['id'],limit:1});
      id=Number(await executeOdoo('res.company','create',[{name:`FinWorkshop · ${workshop.name}`,currency_id:currency.id,...(country?{country_id:country.id}:{})}]));
      await executeOdoo('ir.config_parameter','set_param',[key,String(id)]);
    }
    const settings={...workshop.settings,odooCompanyId:id};
    await connection.query('UPDATE workshops SET settings=CAST(? AS JSON) WHERE id=?',[JSON.stringify(settings),actor.workshopId]);
    return {id,name:workshop.name,currency:'VND',message:'Đã tạo công ty riêng bằng VNĐ. Hoàn thiện hệ thống tài khoản, nhật ký và quy tắc thuế trong Odoo trước khi đồng bộ chứng từ.'};
  });
}
