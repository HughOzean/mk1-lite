import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const base=process.env.MARK1LIGHT_SITE_URL||'http://127.0.0.1:5180';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const errors=[];
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);await expect(page.locator('#release-status')).not.toContainText('正在读取');
 const response=await page.request.get(`${base}/releases.json`);assert.equal(response.status(),200);const release=await response.json();
 for(const platform of ['macos','windows']){
  const card=page.locator(`[data-platform="${platform}"]`),file=release.platforms[platform];
  if(file.available){await expect(card.locator('.download-button')).toBeVisible();await expect(card.locator('.download-button')).toHaveAttribute('href',`${release.repository}/releases/download/${encodeURIComponent(release.tag)}/${encodeURIComponent(file.asset)}`);await expect(card.locator('.checksum code')).toHaveText(file.sha256);assert.match(file.sha256,/^[0-9a-f]{64}$/)}
  else{await expect(card.locator('.download-button')).toBeHidden();await expect(card.locator('.pending-button')).toBeDisabled()}
 }
 await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('lang','en');await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');
 await page.locator('#preview-mode').click();await page.locator('#preview-mode').click();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:'artifacts/download-page-desktop.png'});
 const mobile=await browser.newPage({viewport:{width:390,height:844}});mobile.on('pageerror',error=>errors.push(error.message));await mobile.goto(`${base}/mk1-lite/`);await expect(mobile.locator('#release-status')).not.toContainText('正在读取');assert.equal(await mobile.locator('header.site-header').count(),1);assert.equal(await mobile.locator('section.hero').count(),1);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await mobile.screenshot({path:'artifacts/download-page-mobile.png'});await mobile.locator('#download').scrollIntoViewIfNeeded();await mobile.screenshot({path:'artifacts/download-page-mobile-downloads.png'});
 assert.deepEqual(errors,[]);console.log('PASS: actual download manifest/link/checksum state, unavailable assets disabled, language toggle, interface illustration, fresh mobile viewport and GitHub Pages subpath.');
}finally{await browser.close()}
