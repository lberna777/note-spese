# Note spese

App web (PWA) per le note spese di un consulente che lavora presso aziende clienti per conto
della propria società. Si fotografa lo scontrino, l'app legge importo, data e fornitore, e a fine
mese produce una nota spese in PDF o in Excel per ciascun destinatario (un cliente oppure la
propria azienda).

**La demo contiene solo dati inventati**: persone, aziende, fornitori e scontrini di esempio sono
fittizi.

Provala: https://lberna777.github.io/note-spese/ (dal telefono si aggiunge alla schermata Home).

## Principio: tutto nel telefono

Nessun server e nessuna richiesta a terzi. La lettura dello scontrino (OCR) avviene nel browser,
l'archivio sta in IndexedDB sul dispositivo, PDF ed Excel si generano localmente. I dati non
lasciano mai il telefono, salvo il file che l'utente sceglie di esportare o condividere.

## Funzioni

- Foto o immagine dalla galleria, lettura automatica di importo, data, fornitore, località e
  tipologia, con schermata di conferma precompilata.
- Destinatari (clienti e propria azienda), tratte con rimborso chilometrico.
- Pagamento con due sole carte, «Carta aziendale» e «Carta personale», scelte con due pulsanti
  grandi; la proposta è l'ultimo pagamento usato per lo stesso destinatario. Nessun numero di
  carta viene letto o conservato.
- Elenco del mese, con distinzione tra spese pagate con la carta aziendale e spese anticipate con
  la carta personale, e riepilogo degli anticipi da farsi rimborsare.
- Nota spese per destinatario in PDF (con i giustificativi in coda) e in Excel (con formule),
  salvataggio e ripristino di una copia di sicurezza.
- Tema grafico importabile (vedi sotto), chiaro e scuro; telefono e computer a tutto schermo
  (da 900 px: barra laterale, tabella, pannello della nota; niente fotocamera, si carica un'immagine).
- Su iPhone e iPad, se l'app non è ancora sulla schermata Home, un riquadro chiudibile spiega
  come aggiungerla (altrimenti Safari può cancellare i dati del sito).

## Tema importabile

Nome, logo, carattere e colori dell'azienda non stanno nel codice: si caricano da un file `.json` in
Impostazioni → Aspetto → «Importa tema» e restano solo nel dispositivo (IndexedDB, e nel backup).
«Torna al tema predefinito» ripristina il tema neutro (grafite e blu). Il tema colora l'app, il PDF
e l'Excel. In Impostazioni → Aspetto si sceglie anche Automatico · Chiaro · Scuro (Automatico segue
il sistema). Il PDF usa sempre la variante chiara.

```json
{ "format": "note-spese-tema", "version": 2,
  "companyName": "Nome dell'azienda", "shortName": "Nome breve", "logo": "data:image/png;base64,…",
  "font": "avenir",
  "light": { "bg": "#RRGGBB", "surface": "#RRGGBB", "text": "#RRGGBB", "textMuted": "#RRGGBB",
             "line": "#RRGGBBAA", "lineAccent": "#RRGGBBAA", "accent": "#RRGGBB",
             "accentText": "#RRGGBB", "onAccent": "#RRGGBB" },
  "dark":  { "…": "stesse chiavi" } }
```

- `bg` fondo pagina; `surface` moduli e pannelli; `line` filetti neutri; `lineAccent` filetti
  d'accento; `accent` riempimenti (pulsanti); `accentText` accento usato come testo, leggibile su
  `bg`; `onAccent` testo sopra `accent`. Colori `#RRGGBB` o `#RRGGBBAA`.
- `logo`: data URL PNG, JPEG o SVG, al massimo 500 KB (facoltativo); testi al massimo 120 caratteri.
  Il logo sta su entrambi i fondi (chiaro e scuro): va scelto di conseguenza.
- `font`: `avenir` (Avenir Next / Avenir dove installati, altrimenti Nunito Sans, incluso nell'app;
  nel PDF si incorpora sempre Nunito Sans) o `system` (carattere di sistema).
- Un tema della versione 1 (`colors`, `fonts`) si importa ancora e viene convertito: la variante
  chiara viene dai colori vecchi, quella scura è derivata.
- Contrasto minimo 4,5:1 per testo, testo smorzato, accento come testo e testo sull'accento: i test
  lo verificano sul tema neutro e su quello d'esempio.

Un tema d'esempio, tutto inventato, è `public/esempi/tema-esempio.json` («Studio Aurora S.r.l.»).

## Caratteri del PDF

`scripts/woff-to-ttf.mjs` converte i `.woff` di Nunito Sans (pacchetto `@fontsource/nunito-sans`,
pesi 300, 400, 600) in TTF e li salva in `src/export/fonts/` con `OFL.txt`; i TTF sono nel
repository e si incorporano in jsPDF solo quando si genera il PDF. Per rigenerarli:
`node scripts/woff-to-ttf.mjs`.

## Avvio

```sh
npm install
npm run dev        # http://localhost:5173, e sulla rete locale all'indirizzo che stampa
npm test           # test (vitest)
npm run build      # versione da pubblicare in dist/, funziona anche in una sottocartella
npm run preview    # prova di dist/
```

`npm run dev` e `npm run build` copiano prima in `public/tesseract/` il motore OCR e il modello
italiano (`scripts/copy-tesseract.mjs`); la cartella non è versionata.

Dal telefono sulla stessa rete Wi-Fi si apre l'indirizzo «Network» stampato da `npm run dev`.
Fotocamera e galleria funzionano anche così; l'installazione sulla schermata Home richiede invece
HTTPS.

## Prova veloce

In `public/esempi/` ci sono tre scontrini finti e il tema d'esempio. Per vedere il tema: Impostazioni → Aspetto → «Importa tema» → `tema-esempio.json`. Poi: «Scegli dalla galleria» → uno di questi →
«Conferma spesa» precompilata → Salva → «Nota spese» del destinatario → PDF / Excel.

## Note

- In console compare `failed to load ./ita.special-words`: è un file facoltativo del modello
  linguistico che non esiste nel pacchetto; la lettura funziona lo stesso.
- I dati finti si caricano solo alla prima apertura. Per ripartire da zero: cancellare i dati del
  sito nel browser.

## Stack e licenze delle librerie

| Libreria | Uso | Licenza |
| --- | --- | --- |
| Preact | interfaccia | MIT |
| Tesseract.js | OCR nel browser | Apache-2.0 |
| jsPDF | generazione PDF | MIT |
| jspdf-autotable | tabelle nel PDF | MIT |
| ExcelJS | generazione Excel | MIT |
| idb | accesso a IndexedDB | ISC |
| Nunito Sans (Fontsource) | carattere dell'app e del PDF | OFL-1.1 |

Il progetto è scritto in TypeScript e costruito con Vite; i test usano Vitest.

## Server di sincronizzazione

La sincronizzazione tra dispositivi usa un piccolo server (Cloudflare Worker con database D1) che
conserva solo buste cifrate e non può leggerne il contenuto. Il codice sta in `worker/`, il
protocollo in `docs/sync.md`. Per un uso personale dovrebbe bastare il piano gratuito di Workers e
D1 (i limiti attuali sono sulle pagine dei prezzi di Cloudflare).

Pubblicazione, da un computer con Node:

```sh
cd worker
npm install
npx wrangler login
npx wrangler d1 create note-spese-sync
```

L'ultimo comando stampa un `database_id`: copiarlo in `worker/wrangler.toml` al posto del
segnaposto `00000000-0000-0000-0000-000000000000`. Poi:

```sh
npx wrangler d1 migrations apply note-spese-sync --remote
npx wrangler deploy
```

`deploy` stampa l'indirizzo del server (del tipo `https://note-spese-sync.<account>.workers.dev`).
Va impostato in `VITE_SYNC_URL` quando si costruisce l'app (per esempio
`VITE_SYNC_URL=https://… npm run build`); senza, la sezione «Dispositivi collegati» non compare.

Le origini ammesse dal server sono in `ALLOWED_ORIGINS` (`worker/wrangler.toml`); `http://localhost:*`
è sempre ammesso, per lo sviluppo. I test del server: `cd worker && npx vitest run`.
