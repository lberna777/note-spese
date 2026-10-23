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
- Tema grafico importabile (vedi sotto).
- Su iPhone e iPad, se l'app non è ancora sulla schermata Home, un riquadro chiudibile spiega
  come aggiungerla (altrimenti Safari può cancellare i dati del sito).

## Tema importabile

Nome, logo e colori dell'azienda non stanno nel codice: si caricano da un file `.json` in
Impostazioni → Aspetto → «Importa tema» e restano solo nel telefono (IndexedDB, e nel backup).
«Torna al tema predefinito» ripristina i colori neutri. Il tema colora l'app, il PDF e l'Excel.

```json
{ "format": "note-spese-tema", "version": 1,
  "companyName": "Nome dell'azienda", "logo": "data:image/png;base64,…",
  "colors": { "primary": "#RRGGBB", "accent": "#RRGGBB", "accentText": "#RRGGBB",
              "surface": "#RRGGBB", "text": "#RRGGBB", "textMuted": "#RRGGBB" },
  "fonts": { "heading": "serif", "body": "sans" } }
```

- `primary`: colore scuro delle fasce (intestazioni, barra); `accent`: colore del marchio per
  filetti e dettagli; `accentText`: variante dell'accento leggibile come testo su `surface`;
  `surface`: fondo chiaro.
- `logo`: data URL PNG, JPEG o SVG, al massimo 500 KB (facoltativo). Colori in `#RRGGBB`, testi
  al massimo 120 caratteri.
- `fonts.heading`: `serif` (Bodoni Moda; Times nel PDF) o `system`; `fonts.body`: `sans` (Inter)
  o `system`. I caratteri sono serviti dall'app, senza servizi esterni.

Un tema d'esempio, tutto inventato, è `public/esempi/tema-esempio.json` («Studio Aurora S.r.l.»).

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
| Bodoni Moda, Inter (Fontsource) | caratteri del tema | OFL-1.1 |

Il progetto è scritto in TypeScript e costruito con Vite; i test usano Vitest.
