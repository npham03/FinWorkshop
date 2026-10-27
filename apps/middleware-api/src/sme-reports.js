import { getPool, decodeData, getWorkshop } from './db.js';
import { active, number } from './accounting.js';

const col = (key,label,format) => ({key,label,...(format?{format}:{})});
const moneyCol = (key,label) => col(key,label,'money');
const incoming = type => ['OPENING','RECEIPT','RETURN','FINISHED_RECEIPT','ADJUST_IN'].includes(type);
const value = row => number(row.amount ?? number(row.quantity)*number(row.unitCost));

export function smeFromData(data, from='', to='9999-12-31') {
  const all = entity => (data[entity] || []).filter(active);
  const within = row => (!from || row.date >= from) && row.date <= to;
  const invoices=all('invoices'), moves=all('stock-movements'), logs=all('labor-logs'), jobs=all('production-orders');
  const journal=[];
  const post=(record,lines,description)=>{
    const date=record.date || record.completedAt?.slice(0,10) || from || '';
    if(!within({date}))return;
    const clean=lines.filter(line=>number(line[2])!==0).map(([debit,credit,amount])=>amount<0?[credit,debit,-amount]:[debit,credit,amount]);
    for(const [debitAccount,creditAccount,amount] of clean) journal.push({id:`${record.id}-${journal.length}`,date,code:record.code||'',sourceId:record.id,description:description||record.description||record.counterparty||record.materialName||'',debitAccount,creditAccount,debit:Math.round(amount),credit:Math.round(amount),status:record.status});
  };
  for(const row of invoices){
    const total=number(row.total),vat=row.direction==='INPUT'&&row.inputVatDeductible!==true?0:number(row.taxAmount);
    if(row.direction==='OUTPUT')post(row,[['131','511',total-vat],['131','3331',vat]]);
    else {
      const items=row.items?.length?row.items:[{subtotal:number(row.subtotal),taxAmount:number(row.taxAmount),purchaseCategory:row.purchaseCategory}];
      const lines=items.map(item=>[item.purchaseCategory==='INVENTORY'||!item.purchaseCategory&&row.purchaseCategory==='INVENTORY'?'151':item.purchaseCategory==='ASSET'||!item.purchaseCategory&&row.purchaseCategory==='ASSET'?'211':'642','331',number(item.subtotal)+(vat?0:number(item.taxAmount))]);
      lines[0][2]=number(lines[0][2])+total-vat-lines.reduce((sum,line)=>sum+number(line[2]),0);
      post(row,[...lines,['1331','331',vat]]);
    }
  }
  for(const row of moves){
    const stock=(row.itemEntity==='products'||row.productId)?'155':'152',amount=value(row);
    const counterpart=row.type==='OPENING'?'411':row.type==='RECEIPT'?(row.invoiceId?'151':'3388'):row.type==='ADJUST_IN'?'711':row.type==='ADJUST_OUT'?'632':row.type==='DELIVERY'?'632':row.type==='FINISHED_RECEIPT'?'154':'154';
    post(row,incoming(row.type)?[[stock,counterpart,amount]]:[[counterpart,stock,amount]]);
  }
  for(const row of logs)post(row,[['154','334',Math.round(number(row.hours)*number(row.hourlyRate??row.laborRate))]],`Giờ công · ${row.employeeName||''}`);
  for(const row of all('opening-balances'))post(row,row.partnerType==='CUSTOMER'?[['131','411',number(row.amount)]]:[['411','331',number(row.amount)]],`Đầu kỳ · ${row.partnerName}`);
  for(const row of all('payments')){
    const account=all('cash-accounts').find(item=>item.id===row.accountId),cash=account?.type==='CASH'?'111':'112';
    post(row,row.direction==='RECEIVED'?[[cash,'131',number(row.amount)]]:[['331',cash,number(row.amount)]],`Thanh toán · ${row.counterparty||''}`);
  }
  for(const row of all('transactions').filter(item=>!item.paymentId)){
    const account=all('cash-accounts').find(item=>item.id===row.accountId),cash=account?.type==='CASH'?'111':'112';
    if(row.direction==='TRANSFER')post(row,row.transferSide==='OUT'?[['113',cash,number(row.amount)]]:[[cash,'113',number(row.amount)]]);
    else if(row.direction==='INCOME')post(row,[[cash,row.classification==='OWNER_FUNDING'?'411':row.classification==='BUSINESS_INCOME'?'511':'3388',number(row.amount)]]);
    else post(row,[[row.taxPaymentType==='VAT'?'3331':row.classification==='OWNER_DRAW'?'411':row.classification==='BUSINESS_EXPENSE'?'642':'1388',cash,number(row.amount)]]);
  }
  for(const row of all('accounting-adjustments')){
    const amount=number(row.discountAmount)+number(row.roundingAdjustment);
    post(row,row.direction==='OUTPUT'?[['635','131',amount]]:[['331','515',amount]],row.writeOffReason||'Điều chỉnh tất toán');
  }
  const costs=jobs.map(job=>{
    const issued=moves.filter(row=>row.productionOrderId===job.id&&row.date<=to).reduce((sum,row)=>sum+(['ISSUE','WASTE'].includes(row.type)?value(row):row.type==='RETURN'?-value(row):0),0);
    const labor=logs.filter(row=>row.productionOrderId===job.id&&row.date<=to).reduce((sum,row)=>sum+Math.round(number(row.hours)*number(row.hourlyRate??row.laborRate)),0);
    const receipts=moves.filter(row=>row.sourceProductionOrderId===job.id&&row.date<=to).reduce((sum,row)=>sum+value(row),0);
    const machine=receipts?number(job.actualMachineCost):0;
    if(machine)post({id:`machine-${job.id}`,date:job.acceptedAt?.slice(0,10)||job.completedAt?.slice(0,10),code:job.code},[['154','3388',machine]],'Chi phí máy phân bổ · cần đối chiếu nguồn');
    const serviceFinished=!job.productId&&job.status==='COMPLETED'&&(job.completedAt?.slice(0,10)||'9999')<=to;
    if(serviceFinished)post({id:`service-${job.id}`,date:job.completedAt.slice(0,10),code:job.code},[['632','154',issued+labor]],'Kết chuyển chi phí dịch vụ hoàn thành');
    return {id:job.id,code:job.code,productName:job.productName,status:job.status,quantity:number(job.quantity),materialCost:issued,laborCost:labor,machineCost:machine,totalCost:issued+labor+machine,finishedValue:receipts,wip:Math.max(0,issued+labor+machine-receipts-(serviceFinished?issued+labor:0))};
  });
  journal.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.code).localeCompare(String(b.code)));
  const inventory=[...all('materials').map(row=>({...row,itemEntity:'materials'})),...all('products').map(row=>({...row,itemEntity:'products'}))].filter(row=>row.trackInventory!==false).map(item=>{
    const future=moves.filter(row=>(row.productId||row.materialId)===item.id&&row.date>to);
    return {id:item.id,code:item.code,name:item.name,unit:item.unit,stock:number(item.stock)-future.reduce((sum,row)=>sum+(incoming(row.type)?1:-1)*number(row.quantity),0),stockValue:number(item.stockValue??number(item.stock)*number(item.unitCost??item.cost))-future.reduce((sum,row)=>sum+(incoming(row.type)?1:-1)*value(row),0),itemEntity:item.itemEntity};
  });
  const accounts=new Map();
  for(const row of journal){
    for(const [account,side]of [[row.debitAccount,'debit'],[row.creditAccount,'credit']]){
      const item=accounts.get(account)||{id:account,account,debit:0,credit:0};item[side]+=row[side];accounts.set(account,item);
    }
  }
  const balances=[...accounts.values()].sort((a,b)=>a.account.localeCompare(b.account)).map(row=>({...row,net:row.debit-row.credit}));
  const sumAccount=(prefix,side)=>balances.filter(row=>row.account.startsWith(prefix)).reduce((sum,row)=>sum+number(row[side]),0);
  const revenue=sumAccount('511','credit')-sumAccount('511','debit');
  const cogs=sumAccount('632','debit')-sumAccount('632','credit');
  const operatingExpense=sumAccount('642','debit')-sumAccount('642','credit');
  const financeExpense=sumAccount('635','debit')-sumAccount('635','credit'),financeIncome=sumAccount('515','credit')-sumAccount('515','debit');
  const debt=[];
  for(const [entity,direction]of [['customers','OUTPUT'],['suppliers','INPUT']])for(const partner of all(entity)){
    const alloc=all('payment-allocations').filter(row=>row.date<=to);
    const docs=invoices.filter(row=>row.direction===direction&&(row.counterpartyId===partner.id||!row.counterpartyId&&row.counterparty===partner.name)&&row.date<=to);
    const amount=docs.reduce((sum,row)=>sum+number(row.total)-alloc.filter(item=>item.invoiceId===row.id).reduce((paid,item)=>paid+number(item.allocatedAmount)+number(item.discountAmount)+number(item.roundingAdjustment),0),0);
    const advance=all('payments').filter(row=>(direction==='OUTPUT'?row.direction==='RECEIVED':row.direction==='PAID')&&(row.counterpartyId===partner.id||row.counterparty===partner.name)&&row.date<=to).reduce((sum,row)=>sum+number(row.amount)-alloc.filter(item=>item.paymentId===row.id).reduce((allocated,item)=>allocated+number(item.allocatedAmount),0),0);
    debt.push({id:partner.id,name:partner.name,type:direction==='OUTPUT'?'CUSTOMER':'SUPPLIER',opening:number(partner.openingBalance),openBalance:number(partner.openingBalance)+amount,unallocatedAdvance:advance});
  }
  const columns=[col('date','Ngày','date'),col('code','Chứng từ'),col('description','Nội dung')];
  const books=[
    {code:'SME-NKC',title:'Nhật ký nghiệp vụ quản trị',rows:journal,columns:[...columns,col('debitAccount','TK Nợ'),col('creditAccount','TK Có'),moneyCol('debit','Số tiền')]},
    {code:'SME-TK',title:'Phát sinh tài khoản trong kỳ',rows:balances,columns:[col('account','Tài khoản'),moneyCol('debit','Phát sinh Nợ'),moneyCol('credit','Phát sinh Có'),moneyCol('net','Chênh lệch Nợ − Có')]},
    {code:'SME-KHO',title:'Giá trị tồn nguyên vật liệu và thành phẩm',rows:inventory,columns:[col('code','Mã'),col('name','Mặt hàng'),col('unit','ĐVT'),col('stock','Số lượng'),moneyCol('stockValue','Giá trị tồn')]},
    {code:'SME-GT',title:'Chi phí theo lệnh và sản xuất dở dang',rows:costs,columns:[col('code','Lệnh'),col('productName','Sản phẩm'),moneyCol('materialCost','Vật tư'),moneyCol('laborCost','Nhân công'),moneyCol('machineCost','Máy phân bổ'),moneyCol('finishedValue','Đã nhập thành phẩm'),moneyCol('wip','Dở dang')]},
    {code:'SME-CN',title:'Công nợ và tiền chưa phân bổ',rows:debt,columns:[col('name','Đối tác'),col('type','Loại'),moneyCol('opening','Đầu kỳ'),moneyCol('openBalance','Còn nợ hóa đơn'),moneyCol('unallocatedAdvance','Tiền chưa phân bổ')]},
  ];
  const warnings=[];
  if(logs.some(row=>within(row)&&number(row.hours)>0&&!number(row.hourlyRate??row.laborRate)))warnings.push('Có giờ công chưa xác định đơn giá; chi phí nhân công cần rà soát.');
  if(invoices.some(row=>within(row)&&['REVIEW_REQUIRED','NEEDS_REVIEW'].includes(row.status)))warnings.push('Có hóa đơn chưa rà soát; số liệu đang tạm ghi.');
  if([...all('customers'),...all('suppliers')].some(row=>row.needsBalanceReview))warnings.push('Có số dư công nợ đầu kỳ chuyển từ dữ liệu cũ cần xác nhận.');
  if(all('materials').some(row=>row.needsOpeningReview))warnings.push('Có tồn đầu kỳ chuyển từ dữ liệu cũ cần kiểm kê đối chiếu.');
  if(costs.some(row=>row.machineCost))warnings.push('Chi phí máy được ghi nhận theo nghiệm thu; đối chiếu chứng từ chi phí và phân bổ trước khi khóa sổ.');
  return {from,to,books,summary:{revenue,cogs,grossProfit:revenue-cogs,operatingExpense,financeExpense,financeIncome,operatingProfit:revenue-cogs-operatingExpense-financeExpense+financeIncome,rawMaterials:inventory.filter(row=>row.itemEntity==='materials').reduce((sum,row)=>sum+row.stockValue,0),finishedGoods:inventory.filter(row=>row.itemEntity==='products').reduce((sum,row)=>sum+row.stockValue,0),wip:costs.reduce((sum,row)=>sum+row.wip,0),debit:balances.reduce((sum,row)=>sum+row.debit,0),credit:balances.reduce((sum,row)=>sum+row.credit,0)},warnings,note:'Sổ quản trị SME từ các chứng từ đã ghi nhận. Chưa gồm khấu hao, trích trước, thuế TNDN và bút toán khóa sổ; không thay thế bộ báo cáo tài chính hoặc tờ khai thuế.'};
}

export async function buildSmeReport(wid,from='',to=''){
  const [rows]=await getPool().query('SELECT entity,record_id,data FROM records WHERE workshop_id=?',[wid]);
  const data={};for(const row of rows)(data[row.entity]||=[]).push({...decodeData(row.data),id:row.record_id});
  const workshop=await getWorkshop(wid);
  return {...smeFromData(data,from,to||'9999-12-31'),settings:workshop?.settings||{}};
}
