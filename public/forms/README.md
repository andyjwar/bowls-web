# Downloadable forms

Drop the league's printable forms (PDF or Word) in this folder, then point the
matching card in `src/pages/FormsPage.jsx` at the file, e.g.:

```js
{ title: 'Result card', note: '…', file: '/forms/result-card.pdf' }
```

Cards with `file: null` show as "coming soon" on the Forms page.
