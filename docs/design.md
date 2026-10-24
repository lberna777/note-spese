# Design

Seconda stesura, 2026-10-24. Sostituisce la prima, che seguiva alla lettera l'aspetto standard di
iOS e ne usciva un modulo generico. Ora l'app ha un'**identità editoriale** che prende carattere,
colori e logo dal tema dell'azienda, e resta comoda su iPhone secondo le Human Interface Guidelines
di Apple (HIG, lette il 2026-10-23 su developer.apple.com: *Layout*, *Toolbars*, *Buttons*,
*Color*, *Typography*, *Materials*).

## Principi

1. **Una griglia sola.** Barra in alto, contenuti e pulsanti condividono gli stessi margini e la
   stessa larghezza massima: niente fasce più larghe dei contenuti.
2. **Tipografia, filetti e spazio, non scatole.** Niente schede arrotondate né ombre: sezioni
   separate da filetti sottili, etichette piccole in maiuscoletto spaziato, titoli grandi e
   leggeri, cifre importanti in grassetto con cifre tabellari.
3. **Colonne fisse.** In ogni riga l'importo sta sempre allo stesso filo a destra, la data sempre
   sotto l'importo; i totali stanno in un blocco proprio, non sembrano altre spese.
4. **L'accento solo dove serve.** Il colore del marchio va su ciò che si tocca (pulsanti, scelta
   attiva) e sulle cifre «da rimborsare». Le HIG: se il colore del marchio indica che un elemento
   si tocca, usarlo anche sul testo che non si tocca «confonde».
5. **Chiaro e scuro**, entrambi curati: si sceglie in Impostazioni (Automatico · Chiaro · Scuro).

## Telefono (larghezza < 900 px)

| Zona | Contenuto |
| --- | --- |
| In alto, fissa | Logo del tema a sinistra; sotto, il menu **Mese · Anticipi · Impostazioni** come tre voci in maiuscoletto con un filetto d'accento sotto la voce attiva (come il menu di un sito, non un controllo a segmenti grigio) |
| Titolo | Mese in grande e leggero (30 px, peso 300); sotto, «15 spese · 3 destinatari» in maiuscoletto |
| Riepilogo | Striscia a tre colonne tra due filetti: Totale · Azienda · Anticipi (l'ultima nel colore d'accento) |
| Destinatari | Una sezione per destinatario: nome in maiuscoletto d'accento e tipo a destra; righe spesa; «Da rimborsare» in fondo; pulsante «Nota spese» a filo |
| In basso, fissa | Galleria · **Fotografa** (cerchio pieno d'accento, unica azione in evidenza) · Senza foto. La barra ha un fondo pieno (o sfocato e quasi opaco): il contenuto non deve leggersi sotto le icone |

## Computer (larghezza ≥ 900 px), a tutto schermo

Tre colonne a tutta altezza: **barra laterale** 248 px · **contenuto** elastico · **pannello della
nota** 320 px (sotto i 1200 px il pannello scende sotto la tabella).

| Colonna | Contenuto |
| --- | --- |
| Laterale | Logo; menu verticale (Mese · Anticipi · Destinatari e tratte · Impostazioni) con filetto d'accento sotto la voce attiva; selettore del mese; **destinatari del mese** con il loro totale: se ne sceglie uno; in fondo la data dell'ultimo backup |
| Contenuto | Destinatario e tipo in maiuscoletto, mese in grande; a destra **Carica scontrino** (immagine dal disco, letta come sul telefono) e **Nuova spesa** (in evidenza); quattro riquadri Totale · Carta aziendale · Carta personale · Da rimborsare; **tabella** con colonne Data · Fornitore · Località · Tipologia · Km · Importo · Fattura · Pagato con, intestazione con filetto d'accento, riga selezionata evidenziata |
| Pannello | «Nota spese del mese»: totali, **Scarica il PDF** (in evidenza), Scarica l'Excel, miniature dei giustificativi con quelli mancanti segnalati |

Sul computer **non c'è la fotocamera**: si carica un'immagine già salvata. I moduli (nuova spesa,
modifica, conferma dopo la lettura) si aprono come pannello a destra o finestra centrata, non come
foglio dal basso.

## Regole HIG che restano

- **Area sicura** su iPhone: `viewport-fit=cover` e `env(safe-area-inset-*)`.
- **Bersagli di tocco** di almeno 44 × 44 pt; righe di almeno 44 pt.
- **Un'azione in evidenza per vista** (Fotografa nel Mese, Salva nei moduli, Scarica il PDF nella
  nota): «Keep the number of prominent buttons to one or two per view».
- **Contrasto** almeno 4,5:1 per il testo normale, 3:1 per testo grande e icone. Sui pulsanti
  pieni d'accento il testo è scuro (`onAccent` del tema), non bianco, se il bianco non arriva a 4,5.
- **Testo**: corpo 16–17 px, mai sotto 11 px; `prefers-reduced-motion`,
  `prefers-reduced-transparency`, `prefers-contrast: more` rispettati.

## Caratteri

Il tema dice quale famiglia usare. `avenir` significa: **Avenir Next / Avenir** dove sono già
installati (iPhone, iPad, Mac: caratteri di sistema, nessuna licenza da comprare), altrimenti
**Nunito Sans** (libero, licenza OFL, incluso nell'app), che ha proporzioni molto simili. Nel PDF
si incorpora sempre Nunito Sans, perché Avenir non si può distribuire. `system` significa il
carattere di sistema. Un'unica famiglia per titoli, testo, PDF ed Excel.

## Tema, versione 2

```json
{ "format": "note-spese-tema", "version": 2,
  "companyName": "…", "shortName": "…", "logo": "data:image/png;base64,…",
  "font": "avenir" | "system",
  "light": { "bg": "#…", "surface": "#…", "text": "#…", "textMuted": "#…",
             "line": "#…", "lineAccent": "#…", "accent": "#…", "accentText": "#…", "onAccent": "#…" },
  "dark":  { …stesse chiavi… } }
```

- `bg` fondo pagina; `surface` superfici sollevate (moduli, pannelli); `line` filetti neutri;
  `lineAccent` filetti d'accento (intestazioni, riepiloghi); `accent` riempimenti (pulsanti,
  fotocamera); `accentText` accento usato come testo, leggibile su `bg`; `onAccent` testo sopra
  `accent`. Colori `#RRGGBB` o `#RRGGBBAA`.
- Un tema della versione 1 si importa ancora: i colori vecchi si convertono nelle due varianti.
- **Senza tema** l'app usa un tema neutro (grafite e blu) con la stessa struttura.
- Il PDF usa sempre la variante chiara, perché si stampa e si legge su carta.
