import { writeFile } from 'node:fs/promises';
import { businessDate } from '../apps/middleware-api/src/accounting.js';
const base='http://127.0.0.1:3002/api';
const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner.workflow@fintax.demo',password:'FinTax@2026'})});
if(login.status!==200)throw new Error(`Login ${login.status}`);
const {token}=await login.json();
async function get(path){const response=await fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)throw new Error(`${path} ${response.status}`);return response.json();}
const today=businessDate(),from=`${today.slice(0,7)}-01`;
const [invoices,customers,suppliers,allocations,dashboard]=await Promise.all(['/invoices','/customers','/suppliers','/payment-allocations',`/dashboard?from=${from}&to=${today}`].map(get));
const active=row=>!['CANCELLED','VOID','UNALLOCATED','DEMO_ARCHIVED'].includes(row.status);
const detailed=invoices.filter(active).map(row=>{const paid=allocations.filter(a=>active(a)&&a.invoiceId===row.id&&a.date<=today).reduce((sum,a)=>sum+Number(a.allocatedAmount||0)+Number(a.discountAmount||0)+Number(a.roundingAdjustment||0),0);return {id:row.id,code:row.code,direction:row.direction,date:row.date,status:row.status,partner:row.counterpartyId,total:row.total,paidAmount:row.paidAmount,settledAmount:row.settledAmount,openBalance:row.openBalance,allocated:paid,computed:row.total-paid,difference:row.total-paid-row.openBalance};});
const sum=(rows,field)=>rows.reduce((total,row)=>total+Number(row[field]||0),0);
const output={base,today,from,metrics:dashboard.metrics,totals:{customers:sum(customers,'receivable'),suppliers:sum(suppliers,'payable'),outputOpen:sum(detailed.filter(r=>r.direction==='OUTPUT'),'openBalance'),inputOpen:sum(detailed.filter(r=>r.direction==='INPUT'),'openBalance'),outputComputedAsOfToday:sum(detailed.filter(r=>r.direction==='OUTPUT'&&r.date<=today),'computed'),inputComputedAsOfToday:sum(detailed.filter(r=>r.direction==='INPUT'&&r.date<=today),'computed')},customers,suppliers,discrepancies:detailed.filter(row=>row.difference||row.date>today)};
const [books,sme]=await Promise.all([get(`/reports/books?from=${from}&to=${today}`),get(`/reports/sme?from=${from}&to=${today}`)]);
const expenseRows=books.books.find(book=>book.code==='S3-HKD').rows;
output.operatingCost={smeSummary:sme.summary,s3Total:sum(expenseRows,'expense'),s3BySource:Object.fromEntries([...new Set(expenseRows.map(row=>row.source))].map(source=>[source,sum(expenseRows.filter(row=>row.source===source),'expense')])),s3Rows:expenseRows.map(({code,date,expense,source,purchaseCategory,inputVatDeductible,taxAmount,subtotal})=>({code,date,expense,source,purchaseCategory,inputVatDeductible,taxAmount,subtotal}))};
await writeFile(new URL('./dashboard-debt-readonly.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
