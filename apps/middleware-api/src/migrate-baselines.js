import { getPool,decodeData,createAudit } from './db.js';
import { active,number } from './accounting.js';

// Preserve historical values; only unused, system-seeded examples are quarantined.
// Never infer a real warehouse receipt from an old editable balance.
export async function migrateBaselines(){
  const [records]=await getPool().query(`SELECT workshop_id,entity,record_id,data FROM records WHERE
    (entity IN ('customers','suppliers') AND data->'openingBalance' IS NULL) OR
    (entity IN ('materials','products') AND workshop_id <> '00000000-0000-0000-0000-000000000002' AND
      (data->'stockValue' IS NULL OR (data->>'seeded'='true' AND COALESCE(data->>'status','')<>'DEMO_ARCHIVED')))`);
  const grouped=new Map();
  let updated=0,quarantined=0;
  for(const record of records){
    const before=decodeData(record.data),wid=record.workshop_id;let after=null,reason='';
    if(!grouped.has(wid)){const [rows]=await getPool().query('SELECT entity,record_id,data FROM records WHERE workshop_id=?',[wid]);grouped.set(wid,rows);}
    const siblings=grouped.get(wid).filter(row=>row.record_id!==record.record_id);
    if(['customers','suppliers'].includes(record.entity)&&before.openingBalance===undefined){
      const direction=record.entity==='customers'?'OUTPUT':'INPUT',field=record.entity==='customers'?'receivable':'payable';
      const open=siblings.filter(row=>row.entity==='invoices').map(row=>decodeData(row.data)).filter(row=>active(row)&&(row.direction||row.type)===direction&&(row.counterpartyId===record.record_id||!row.counterpartyId&&row.counterparty===before.name)).reduce((sum,row)=>sum+number(row.openBalance??number(row.total)-number(row.settledAmount??row.paidAmount)),0);
      const openingBalance=number(before[field])-open;
      after={...before,openingBalance,...(openingBalance?{needsBalanceReview:true,openingOrigin:'LEGACY_REQUIRES_CONFIRMATION'}:{})};
      reason=openingBalance?'Giữ nguyên số dư cũ; phần đầu kỳ suy ra cần đối chiếu chứng từ.':'';
    }
    if(['materials','products'].includes(record.entity)&&wid!=='00000000-0000-0000-0000-000000000002'){
      const referenced=siblings.some(row=>!['tax-rules','products','materials'].includes(row.entity)&&(()=>{const text=JSON.stringify(row.data);return text.includes(record.record_id)||before.name&&text.includes(JSON.stringify(before.name));})());
      if(before.seeded&&!referenced&&before.status!=='DEMO_ARCHIVED'){
        after={...before,status:'DEMO_ARCHIVED',archiveReason:'Danh mục mẫu chưa sử dụng; tách khỏi dữ liệu doanh nghiệp.'};reason=after.archiveReason;quarantined++;
      }else if(before.stockValue===undefined){
        after={...before,stockValue:Math.round(number(before.stock)*number(before.unitCost??before.cost)),trackInventory:before.trackInventory!==false,needsOpeningReview:number(before.stock)!==0,stockOrigin:'LEGACY_REQUIRES_CONFIRMATION'};
        reason=number(before.stock)?'Giữ tồn cũ và đánh dấu cần kiểm kê; chưa coi là phiếu nhập thật.':'';
      }
    }
    if(!after)continue;
    await getPool().query('UPDATE records SET data=CAST(? AS JSON) WHERE workshop_id=? AND entity=? AND record_id=?',[JSON.stringify(after),wid,record.entity,record.record_id]);updated++;
    if(reason)await createAudit({actor:{id:'system-migration',name:'Chuẩn hóa dữ liệu đầu kỳ',role:'SYSTEM',workshopId:wid},action:'BASELINE_REVIEW',entity:record.entity,recordId:record.record_id,beforeData:before,afterData:after,reason});
  }
  if(updated)console.info(`Baseline migration: ${updated} records preserved, ${quarantined} unused demo records quarantined.`);
  return {updated,quarantined};
}
