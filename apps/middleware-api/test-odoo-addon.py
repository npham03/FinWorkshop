from odoo import api
from odoo.exceptions import ValidationError
from uuid import uuid4
try:
    currency = env['res.currency'].with_context(active_test=False).search([('name','=','VND')],limit=1)
    currency.active = True
    company = env['res.company'].create({'name':'FinWorkshop rollback test '+uuid4().hex[:8],'currency_id':currency.id,'country_id':env.ref('base.vn').id,'account_fiscal_country_id':env.ref('base.vn').id})
    test_env = api.Environment(env.cr, env.uid, {'allowed_company_ids':[company.id]})
    def account(code,name,kind,reconcile=False):
        return test_env['account.account'].create({'code':code,'name':name,'account_type':kind,'company_id':company.id,'reconcile':reconcile})
    payable=account('331T','Payable test','liability_payable',True)
    receivable=account('131T','Receivable test','asset_receivable',True)
    expense=account('642T','Expense test','expense')
    tax_paid=account('133T','Tax paid test','asset_current')
    bank_account=account('112T','Bank test','asset_cash')
    outstanding=account('113T','Outstanding payments test','asset_current',True)
    account('515T','Cash Discount Gain','income')
    account('635T','Cash Discount Loss','expense')
    account('620T','Bank Fees','expense')
    purchase=test_env['account.journal'].create({'name':'Purchase test','code':'TBUY','type':'purchase','company_id':company.id,'default_account_id':expense.id})
    bank=test_env['account.journal'].create({'name':'Bank test','code':'TBNK','type':'bank','company_id':company.id,'default_account_id':bank_account.id})
    general=test_env['account.journal'].create({'name':'General test','code':'TGEN','type':'general','company_id':company.id})
    method=bank.outbound_payment_method_line_ids[:1]
    assert method, 'No outbound payment method'
    method.payment_account_id=outstanding
    partner=test_env['res.partner'].create({'name':'Rollback vendor'})
    partner.with_company(company).property_account_payable_id=payable
    partner.with_company(company).property_account_receivable_id=receivable
    tax=test_env['account.tax'].create({'name':'VAT 8% rollback','amount':8,'amount_type':'percent','type_tax_use':'purchase','company_id':company.id})
    tax.invoice_repartition_line_ids.filtered(lambda line:line.repartition_type=='tax').account_id=tax_paid
    tax.refund_repartition_line_ids.filtered(lambda line:line.repartition_type=='tax').account_id=tax_paid
    invoice=test_env['account.move'].create({'move_type':'in_invoice','journal_id':purchase.id,'company_id':company.id,'currency_id':currency.id,'partner_id':partner.id,'invoice_date':'2026-10-27','invoice_line_ids':[(0,0,{'name':'Material test','quantity':1,'price_unit':100000,'account_id':expense.id,'tax_ids':[(6,0,tax.ids)]})]})
    assert invoice.amount_total==108000, invoice.amount_total
    invoice.action_post()
    payment=test_env['account.payment'].create({'payment_type':'outbound','partner_type':'supplier','partner_id':partner.id,'journal_id':bank.id,'payment_method_line_id':method.id,'amount':107995,'currency_id':currency.id,'date':'2026-10-27'})
    payment.action_post()
    adj_id=uuid4().hex
    payload={'sourceKey':'accounting-adjustments:'+adj_id,'discountAmount':4,'roundingAdjustment':1,'bankFeeAmount':3,'date':'2026-10-27','status':'ACTIVE','writeOffReason':'Rollback test difference'}
    adjustment_id=invoice.fintax_sync_adjustment(payload)
    adjustment=test_env['account.move'].browse(adjustment_id)
    assert sum(adjustment.line_ids.mapped('debit'))==sum(adjustment.line_ids.mapped('credit'))
    adjustment.action_post()
    allocation={'sourceKey':'payment-allocations:'+uuid4().hex,'allocatedAmount':107995,'discountAmount':4,'roundingAdjustment':1,'bankFeeAmount':3,'adjustmentId':adj_id,'date':'2026-10-27','status':'ACTIVE'}
    invoice.fintax_sync_allocation(payment.id,allocation)
    assert invoice.amount_residual==0, invoice.amount_residual
    count=test_env['account.partial.reconcile'].search_count([('fintax_source_key','in',[allocation['sourceKey'],allocation['sourceKey']+':adjustment'])])
    invoice.fintax_sync_allocation(payment.id,allocation)
    assert test_env['account.partial.reconcile'].search_count([('fintax_source_key','in',[allocation['sourceKey'],allocation['sourceKey']+':adjustment'])])==count
    invoice.fintax_sync_allocation(payment.id,{**allocation,'status':'UNALLOCATED'})
    assert invoice.amount_residual==108000, invoice.amount_residual
    invoice.fintax_sync_adjustment({**payload,'status':'CANCELLED'})
    assert adjustment.state=='cancel', adjustment.state
    invoice.fintax_cancel_invoice()
    assert invoice.state=='cancel', invoice.state
    print('PASS LIVE ODOO: posted INPUT + payment + balanced discount/rounding/bank-fee entry -> full reconcile -> idempotent retry -> unreconcile -> cancel adjustment and invoice')
except Exception:
    import traceback
    traceback.print_exc()
    raise
finally:
    env.cr.rollback()
    print('ROLLBACK COMPLETE: test company and accounting documents were not retained')

