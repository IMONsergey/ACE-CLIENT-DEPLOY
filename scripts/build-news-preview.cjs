'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const newsStart = page.indexOf('      <section class="news-section"');
const newsEnd = page.indexOf('      <section class="membership-section"', newsStart);
const dialogStart = page.indexOf('  <dialog class="news-dialog"');
const dialogEnd = page.indexOf('  <script src="assets/js/typograph.js"', dialogStart);
const sprite = page.match(/  <svg class="svg-sprite"[\s\S]*?<\/svg>/)?.[0];
if ([newsStart, newsEnd, dialogStart, dialogEnd].some((n) => n < 0) || !sprite) {
  throw new Error('Cannot locate the canonical news markup in index.html');
}

// One canonical article/template in index.html. The isolated preview is regenerated,
// never maintained as an independent, potentially stale copy of the content.
const news = page.slice(newsStart, newsEnd).trim();
const dialog = page.slice(dialogStart, dialogEnd).trim();
const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>ACE | Новости</title>
  <link rel="icon" href="assets/images/meta/favicon.ico">
  <link rel="stylesheet" href="assets/css/fonts.css">
  <link rel="stylesheet" href="assets/css/styles.css">
  <link rel="stylesheet" href="assets/css/news-dialog.css">
  <link rel="stylesheet" href="assets/css/news-preview.css">
</head>
<body class="news-preview">
${sprite}
<main>${news}</main>
${dialog}
<script src="assets/js/responsive-slider.js"></script>
<script src="assets/js/news-dialog.js"></script>
<script src="assets/js/news-preview.js"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'news-preview.html'), html);
console.log('Generated news-preview.html from index.html');
