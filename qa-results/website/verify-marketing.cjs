// Tests only: public pages, actual demo login and synthetic website inquiry.
// Run after the rebuilt UI/API are ready: node qa-results/website/verify-marketing.cjs
const {chromium}=require('C:/Users/ASUS TUF/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const base=process.env.WEBSITE_QA_URL||'http://127.0.0.1:5184',api=process.env.WEBSITE_QA_API||'http://127.0.0.1:3005/api';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api$/.test(api))throw new Error('QA is limited to the authorized local website/API.');
const out=__dirname,tag=`WEBSITE-QA-${Date.now()}`;
const routes=['/','/san-pham','/giai-phap/san-xuat','/giai-phap/ke-toan','/trien-khai','/tai-lieu','/lien-he','/demo','/bao-mat','/dieu-khoan'];
const appPaths=['/app','/transactions','/payments','/reconciliation','/invoices','/reports','/quotations','/catalog','/workshop','/inventory','/customers','/suppliers','/settings'];
const known=new Set([...routes,...appPaths,'/login','/register','/forgot-password','/reset-password']);
fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
const evidence={tag,base,api,startedAt:new Date().toISOString(),browser:'Microsoft Edge / isolated headless contexts',checks:[],routes:[],pageErrors:[],consoleErrors:[],failedAssets:[],inquiryHttp:[]};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
async function check(name,run){try{const result=await run();evidence.checks.push({name,status:'PASS',...result});console.log('PASS',name);}catch(error){evidence.checks.push({name,status:'FAIL',error:error.message});console.log('FAIL',name,error.message);}}
function instrument(page){
 page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(20000);
 page.on('pageerror',error=>evidence.pageErrors.push({path:new URL(page.url()).pathname,message:error.message}));
 page.on('console',msg=>{if(msg.type()==='error')evidence.consoleErrors.push({path:new URL(page.url()).pathname,message:msg.text()});});
 page.on('response',response=>{if(response.status()>=400&&/\.(png|jpe?g|webp|svg|woff2?|css|js)(\?|$)/i.test(response.url()))evidence.failedAssets.push({url:response.url(),status:response.status()});});
}
async function shot(page,name){const file=`screenshots/${name}.png`;await page.screenshot({path:path.join(out,file),fullPage:true});return file;}
async function visit(page,route){await page.goto(base+route,{waitUntil:'networkidle'});await page.locator('h1').first().waitFor();await wait(100);}
async function publicAudit(page,route,size){
 await visit(page,route);
 await page.locator('img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
 await wait(150);
 const audit=await page.evaluate(()=>({
  pathname:location.pathname,title:document.title,h1s:[...document.querySelectorAll('h1')].map(el=>el.textContent.trim()),
  overflow:document.documentElement.scrollWidth>innerWidth+1,
  brokenImages:[...document.images].filter(image=>image.complete&&image.naturalWidth===0).map(image=>({src:image.getAttribute('src'),alt:image.alt})),
  links:[...document.querySelectorAll('a[href]')].map(el=>({text:el.textContent.trim(),href:el.getAttribute('href'),nav:!!el.closest('header,footer,nav')})),
  passwordsPersisted:Object.values(localStorage).some(value=>value.includes('FinTax@2026'))||Object.values(sessionStorage).some(value=>value.includes('FinTax@2026'))
 }));
 const invalidLinks=audit.links.filter(link=>{const href=link.href||'';if(!href||href==='#'||href.startsWith('javascript:'))return true;if(link.nav&&href.startsWith('#'))return true;if(/^(mailto:|tel:|https?:)/.test(href)&&!href.startsWith(base))return false;const url=new URL(href,base);return url.origin===new URL(base).origin&&!known.has(url.pathname);});
 const result={route,size,...audit,invalidLinks,screenshot:await shot(page,`${size}-${route==='/'?'home':route.slice(1).replaceAll('/','-')}`)};
 if(route==='/'&&size==='desktop'){await page.screenshot({path:path.join(out,'screenshots/home-desktop-viewport.png'),fullPage:false});result.viewportScreenshot='screenshots/home-desktop-viewport.png';}
 evidence.routes.push(result);
 assert(audit.pathname===route,`Public route redirected ${route} -> ${audit.pathname}`);
 assert(audit.h1s.length===1&&audit.h1s[0].length>8,`Expected one meaningful h1: ${JSON.stringify(audit.h1s)}`);
 assert(!audit.overflow,`${size} horizontal overflow on ${route}`);
 assert(!audit.brokenImages.length,`Broken image(s): ${JSON.stringify(audit.brokenImages)}`);
 assert(!invalidLinks.length,`Dead/hash navigation link(s): ${JSON.stringify(invalidLinks)}`);
 assert(!audit.passwordsPersisted,'Demo password persisted in browser storage');
 return {route,size,h1:audit.h1s[0],linkCount:audit.links.length,screenshot:result.screenshot};
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const publicContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'vi-VN'}),page=await publicContext.newPage();instrument(page);
 for(const route of routes)await check(`desktop ${route}`,()=>publicAudit(page,route,'desktop'));
 await check('Homepage preview tabs support keyboard and load the selected real screenshot',async()=>{
  await visit(page,'/');const tabs=page.getByRole('tablist',{name:'Màn hình sản phẩm'}).getByRole('tab'),image=page.getByRole('tabpanel').locator('img'),seen=[];await tabs.first().focus();
  for(const [key,id,source]of [['ArrowRight','fw-tab-production','finworkshop-production.png'],['End','fw-tab-invoices','finworkshop-invoices.png'],['Home','fw-tab-dashboard','finworkshop-dashboard.png']]){
   await page.keyboard.press(key);await page.waitForFunction(({id,source})=>document.activeElement?.id===id&&document.getElementById(id)?.getAttribute('aria-selected')==='true'&&document.querySelector('[role=tabpanel] img')?.getAttribute('src')?.endsWith(source),{id,source});await image.evaluate(image=>image.decode());assert(await image.evaluate(image=>image.naturalWidth>0),'Selected screenshot broken');seen.push({key,selected:id,source});
  }return {transitions:seen,keyboardRovingFocus:true};
 });
 await check('Homepage FAQ opens another answer and closes it again',async()=>{
  await visit(page,'/');const questions=page.locator('.fw-faq-list button'),second=questions.nth(1);await second.click();assert(await second.getAttribute('aria-expanded')==='true','FAQ did not open');assert(await questions.first().getAttribute('aria-expanded')==='false','Previous FAQ remained open');const id=await second.getAttribute('aria-controls');assert(await page.locator('#'+id).isVisible(),'FAQ answer not visible');await second.click();assert(await second.getAttribute('aria-expanded')==='false'&&!await page.locator('#'+id).isVisible(),'FAQ did not close');return {questionCount:await questions.count(),opensAndCloses:true,previousAnswerClosed:true};
 });
 await check('Desktop solution disclosure opens real routes and closes with Escape',async()=>{
  await visit(page,'/');const menu=page.getByRole('button',{name:'Giải pháp',exact:true});await menu.click();assert(await menu.getAttribute('aria-expanded')==='true','Solution menu did not open');assert(await page.locator('#fw-solutions-menu a').count()===2,'Missing solution destinations');await page.keyboard.press('Escape');assert(await menu.getAttribute('aria-expanded')==='false','Escape did not close disclosure');return {destinationCount:2,escapeCloses:true};
 });
 await page.setViewportSize({width:390,height:844});
 for(const route of routes)await check(`mobile390 ${route}`,()=>publicAudit(page,route,'mobile'));
 await check('Mobile navigation opens and reaches a different public page',async()=>{
  await visit(page,'/');const toggle=page.getByRole('button',{name:/Mở menu|Mở trình đơn/i}).first();await toggle.click();
  const nav=page.locator('header').getByRole('link',{name:/Sản phẩm/i});await nav.first().click();await page.waitForURL(base+'/san-pham');return {actualPath:new URL(page.url()).pathname};
 });
 await check('Documentation search, negative result, category and article have real behavior',async()=>{
  await visit(page,'/tai-lieu');const search=page.getByRole('searchbox',{name:'Tìm trong tài liệu'});await search.fill('qa-no-match-zzzz');await page.getByRole('heading',{name:'Chưa có bài phù hợp với từ khóa này.',exact:true}).waitFor();await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();
  assert(await page.locator('.fw-m-doc-card').count()===6,'Reset did not restore6 documents');await page.getByRole('button',{name:'Tài chính',exact:true}).click();assert(await page.locator('.fw-m-doc-card').count()===2,'Category did not filter2 finance articles');
  await page.locator('.fw-m-doc-card h2 a').first().click();await page.waitForURL(url=>url.searchParams.has('bai'));assert(await page.locator('.fw-m-doc-article section').count()>=2,'Article lacks meaningful content');return {resetCount:6,financeCount:2,articlePath:new URL(page.url()).pathname+new URL(page.url()).search,screenshot:await shot(page,'docs-article')};
 });
 await check('Implementation CTA contact type is preserved in form',async()=>{
  await visit(page,'/lien-he?type=IMPLEMENTATION');const value=await page.locator('select[name=type]').inputValue();assert(value==='IMPLEMENTATION','Contact form lost implementation intent');return {type:value};
 });
 await check('Inquiry API rejects malformed synthetic request with field errors',async()=>{
  const response=await page.request.post(api+'/website/inquiries',{data:{name:'X',email:'not-email',message:'short',type:'CONTACT',consent:false}}),data=await response.json();
  evidence.inquiryHttp.push({method:'POST',path:'/website/inquiries',kind:'invalid',status:response.status(),response:data});
  assert(response.status()===400,`Invalid inquiry expected400, got${response.status()}`);assert(data.fields&&Object.keys(data.fields).length>=2,'Missing field errors');return {statusCode:response.status(),fieldNames:Object.keys(data.fields)};
 });
 await check('Contact form validates client side then persists one real synthetic inquiry',async()=>{
  await visit(page,'/lien-he');const form=page.locator('form').first();
  const name=form.locator('[name=name]'),email=form.locator('[name=email]'),company=form.locator('[name=company]'),phone=form.locator('[name=phone]'),message=form.locator('[name=message]'),consent=form.locator('[name=consent]');
  const submit=form.locator('button[type=submit]');let posts=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/website/inquiries'))posts++;});
  await form.evaluate(form=>form.requestSubmit());await wait(120);assert(posts===0,'Blank contact form sent request');
  await name.fill(tag);await email.fill('invalid-email');await company.fill(tag);await phone.fill('0900000000');await message.fill(`${tag}: yêu cầu kiểm thử website trong môi trường cô lập, không cần liên hệ thực tế.`);
  await form.evaluate(form=>form.requestSubmit());await wait(120);assert(posts===0,'Malformed email submitted request');
  await email.fill(`${tag.toLowerCase()}@example.invalid`);await form.evaluate(form=>form.requestSubmit());await wait(120);assert(posts===0,'Missing consent submitted request');
  await consent.check();const pending=page.waitForResponse(response=>response.url().endsWith('/website/inquiries')&&response.request().method()==='POST');
  await submit.click();const response=await pending,data=await response.json();evidence.inquiryHttp.push({method:'POST',path:'/website/inquiries',kind:'valid-ui',status:response.status(),response:data});
  assert(response.status()===201&&data.ok&&/^FW-/.test(data.reference),'Valid inquiry did not return durable reference');
  await page.getByText(data.reference,{exact:false}).first().waitFor();
  const persistence=await page.evaluate(({tag})=>({localKeys:Object.keys(localStorage),sessionKeys:Object.keys(sessionStorage),contactDataPersisted:[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes(tag)||value.includes('FinTax@2026'))}),{tag});
  assert(!persistence.contactDataPersisted,'Contact data/password left in browser storage');
  return {statusCode:response.status(),reference:data.reference,posts,clientInvalidBlocked:true,persistence,screenshot:await shot(page,'contact-success')};
 });
 const demoContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'vi-VN'}),demo=await demoContext.newPage();instrument(demo);
 await check('Public demo performs actual seeded login and opens dashboard',async()=>{
  await visit(demo,'/demo');const role=demo.locator('input[type=radio][value=OWNER],input[type=radio][value=owner]').first();await role.check();
  const pending=demo.waitForResponse(response=>response.url().endsWith('/auth/login')&&response.request().method()==='POST');
  await demo.getByRole('button',{name:/Mở phiên/i}).click();const response=await pending;
  assert(response.status()===200,`Demo login response${response.status()}`);await demo.waitForURL(base+'/app');await demo.locator('h1,h2').first().waitFor();
  const state=await demo.evaluate(()=>({tokenPresent:!!localStorage.getItem('fintax_token'),role:JSON.parse(localStorage.getItem('fintax_user')||'null')?.role,passwordPersisted:[...Object.values(localStorage),...Object.values(sessionStorage)].some(value=>value.includes('FinTax@2026'))}));
  assert(state.tokenPresent&&state.role==='OWNER'&&!state.passwordPersisted,'Demo auth/session contract failed');return {loginStatus:response.status(),path:'/app',...state,screenshot:await shot(demo,'demo-dashboard')};
 });
 await check('Public marketing visit does not force logout',async()=>{
  await demo.goto(base+'/san-pham');await demo.locator('h1').waitFor();const tokenPresent=await demo.evaluate(()=>!!localStorage.getItem('fintax_token'));assert(tokenPresent,'Public page logged user out');return {tokenPresent};
 });
 const authContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'vi-VN'}),auth=await authContext.newPage();instrument(auth);
 await check('Login honors safe internal next destination',async()=>{
  await auth.goto(base+'/login?next=%2Finventory');await auth.locator('input[type=email]').fill('owner.workflow@fintax.demo');await auth.locator('input[type=password]').fill('FinTax@2026');await auth.getByRole('button',{name:'Đăng nhập',exact:true}).click();await auth.waitForURL(base+'/inventory');return {actualPath:new URL(auth.url()).pathname};
 });
 await check('Malicious next cannot redirect an authenticated session outside app',async()=>{
  await auth.goto(base+'/login?next=%2F%2Fevil.example');await auth.waitForURL(url=>url.origin===new URL(base).origin&&url.pathname==='/app');return {actualOrigin:new URL(auth.url()).origin,actualPath:new URL(auth.url()).pathname};
 });
 await check('Public routes have distinct titles and meaningful destination content',async()=>{
  const desktop=evidence.routes.filter(route=>route.size==='desktop');assert(desktop.length===routes.length,'Route audit incomplete');assert(new Set(desktop.map(route=>route.title)).size===routes.length,'Public pages reuse document title');assert(new Set(desktop.map(route=>route.h1s[0])).size===routes.length,'Public pages repeat main content heading');return {uniqueTitles:new Set(desktop.map(route=>route.title)).size,uniqueH1s:new Set(desktop.map(route=>route.h1s[0])).size};
 });
 await publicContext.close();await demoContext.close();await authContext.close();await browser.close();
 evidence.finishedAt=new Date().toISOString();evidence.summary={passed:evidence.checks.filter(check=>check.status==='PASS').length,failed:evidence.checks.filter(check=>check.status==='FAIL').length,pageErrors:evidence.pageErrors.length,consoleErrors:evidence.consoleErrors.length,failedAssets:evidence.failedAssets.length};
 fs.writeFileSync(path.join(out,'marketing-qa.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence.summary));if(evidence.summary.failed||evidence.pageErrors.length||evidence.consoleErrors.length||evidence.failedAssets.length)process.exitCode=1;
})().catch(error=>{evidence.fatal=error.message;fs.writeFileSync(path.join(out,'marketing-qa.json'),JSON.stringify(evidence,null,2));console.error(error);process.exitCode=1;});
