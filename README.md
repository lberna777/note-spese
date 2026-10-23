# Note spese

App web (PWA) per le note spese di un consulente che lavora presso aziende clienti per conto
della propria società. Si fotografa lo scontrino, l'app legge importo, data e fornitore, e a fine
mese produce una nota spese in PDF o in Excel per ciascun destinatario (un cliente oppure la
propria azienda).

**La demo contiene solo dati inventati**: persone, aziende, fornitori e scontrini di esempio sono
fittizi.

## Principio: tutto nel telefono

Nessun server e nessuna richiesta a terzi. La lettura dello scontrino (OCR) avviene nel browser,
l'archivio sta in IndexedDB sul dispositivo, PDF ed Excel si generano localmente. I dati non
lasciano mai il telefono, salvo il file che l'utente sceglie di esportare o condividere.

## Funzioni

- Foto o immagine dalla galleria, lettura automatica di importo, data, fornitore, metodo di
  pagamento e carta, con schermata di conferma precompilata.
- Destinatari (clienti e propria azienda), carte (aziendale o personale), tratte con rimborso
  chilometrico.
- Elenco del mese, con distinzione tra spese pagate dall'azienda e spese anticipate dal
  consulente, e riepilogo degli anticipi da farsi rimborsare.
- Nota spese per destinatario in PDF e in Excel (con formule), salvataggio e ripristino di una
  copia di sicurezza.

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

In `public/esempi/` ci sono tre scontrini finti: «Scegli dalla galleria» → uno di questi →
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

Il progetto è scritto in TypeScript e costruito con Vite; i test usano Vitest.
