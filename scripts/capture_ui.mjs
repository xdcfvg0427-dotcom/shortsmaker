import fs from 'node:fs';
import {chromium} from '@playwright/test';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8000';
const {projectId}=JSON.parse(fs.readFileSync('storage/verification/variants.json','utf8'));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined)});
try{
  fs.mkdirSync('docs/screenshots',{recursive:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(base);
  await page.getByRole('heading',{name:'오늘은 어떤 이야기를 만들까요?'}).waitFor();
  await page.screenshot({path:'docs/screenshots/dashboard.png',fullPage:true});
  await page.goto(base+'/#studio/'+projectId);
  await page.getByLabel('장면 자막').waitFor();
  await page.screenshot({path:'docs/screenshots/editor.png',fullPage:true});
  await page.getByRole('button',{name:/3\. 완성 영상/}).click();
  await page.getByRole('link',{name:'MP4 영상'}).first().waitFor();
  await page.screenshot({path:'docs/screenshots/results.png',fullPage:true});
  console.log('Captured dashboard, editor, and four completed outputs.');
}finally{await browser.close();}
