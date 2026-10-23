# Design — come su iPhone

L'app si usa soprattutto da iPhone, aggiunta alla schermata Home: deve sembrare un'app di iOS.
Questo documento traduce in regole per una PWA le Human Interface Guidelines di Apple (HIG),
lette il 2026-10-23 su developer.apple.com/design/human-interface-guidelines (pagine *Layout*,
*Toolbars*, *Tab bars*, *Segmented controls*, *Buttons*, *Color*, *Typography*, *Materials*).
Le citazioni sono tradotte; ciò che non viene dalle HIG è segnato come scelta nostra.

## Struttura delle schermate

| Zona | Cosa contiene | Regola HIG |
| --- | --- | --- |
| **In alto** | Marchio del tema (se c'è), titolo grande della sezione, controllo a segmenti **Mese · Anticipi · Impostazioni** | Un controllo a segmenti offre «scelte strettamente collegate che riguardano un oggetto, uno stato o una vista»; su iPhone «non più di circa cinque segmenti», di larghezza uguale |
| **Contenuto** | Elenchi a gruppi con angoli arrotondati | Raggruppare gli elementi collegati con spazio, forme contenitore o separatori |
| **In basso** | Barra degli strumenti con le azioni per aggiungere spese: **Fotografa** (azione principale), **Galleria**, **Senza scontrino** | Una toolbar «agisce sul contenuto della vista»; le azioni non vanno nella barra di navigazione tra sezioni |

*Scelta nostra, su richiesta di Lorenzo*: la navigazione tra le tre sezioni sta in alto, come
controllo a segmenti, e non in una tab bar in basso, che sarebbe la soluzione abituale di iOS.
Così il pollice trova in basso solo le azioni per aggiungere spese, che sono le più frequenti. La
barra in basso compare solo nella sezione Mese, perché agisce su quella vista.

## Regole

- **Area sicura**: niente testo o controlli sotto la Dynamic Island o la barra della Home
  («Adhere to the screen's safe area»). In CSS: `viewport-fit=cover` e `env(safe-area-inset-*)`.
- **Bersagli di tocco**: almeno 44 × 44 pt («a button needs a hit region of at least 44x44 pt»).
  Righe degli elenchi alte almeno 44 pt.
- **Margini**: 16 pt ai lati su iPhone, come i margini standard di sistema.
- **Un'azione in evidenza per vista**: «Keep the number of prominent buttons to one or two per
  view». In Mese l'azione in evidenza è Fotografa (pulsante circolare pieno nel colore d'accento);
  Galleria e Senza scontrino sono secondari. Nei moduli l'azione in evidenza è Salva.
- **Barre senza fondi pieni**: «Reduce the use of toolbar backgrounds and tinted controls»; il
  contenuto scorre sotto le barre, che lo sfocano (in CSS `backdrop-filter: blur()` su un fondo
  semitrasparente). Liquid Glass non si usa nel contenuto («Don't use Liquid Glass in the content
  layer»): l'effetto vetro resta alle due barre.
- **Colore**: colori di sistema per testi e fondi, colore del marchio come accento degli elementi
  interattivi. Le HIG: in un'app dai contenuti per lo più monocromatici, usare il colore del
  marchio come accento «può essere un modo efficace» di riflettere l'identità dell'azienda; e se il
  colore del marchio indica che un pulsante si tocca, lo stesso colore sul testo non interattivo
  «confonde». Quindi l'accento del tema si usa **solo** per ciò che si tocca.
- **Contrasto**: almeno 4,5:1 per il testo normale, 3:1 per testo grande e icone. Con un accento
  che su fondo chiaro non arriva a 4,5 (succede spesso con oro, rame, arancio), il testo dei link usa la variante
  `accentText` del tema; il pulsante pieno usa l'accento con testo o icona bianchi in grassetto.
- **Caratteri**: testo e interfaccia nel carattere di sistema (`-apple-system`, cioè SF Pro su
  iPhone), corpo 17 pt, minimo 11 pt (tabella *Typography*). Un carattere del marchio solo per i
  titoli grandi, se il tema lo chiede. Rispettare la dimensione del testo scelta dall'utente.
- **Tema scuro e preferenze**: supporto a tema scuro, `prefers-contrast: more` e
  `prefers-reduced-motion` e `prefers-reduced-transparency` (niente sfocature, fondi pieni).

## Componenti

| Componente | Aspetto |
| --- | --- |
| Titolo grande | 34 pt grassetto, allineato a sinistra; si riduce a titolo piccolo centrato nella barra in alto quando si scorre |
| Controllo a segmenti | Capsula grigia (`rgba(118,118,128,.12)`), segmento scelto bianco con ombra leggera (scuro: `#636366`); testo 13–15 pt semibold |
| Elenco a gruppi | Fondo della pagina `#F2F2F7` (scuro `#000`), gruppi bianchi (scuro `#1C1C1E`) con raggio 10–12 pt, separatori sottili rientrati di 16 pt, freccia `›` grigia sulle righe che si aprono |
| Riga spesa | Fornitore (17 pt), sotto tipologia · carta · fattura (15 pt, grigio secondario), importo a destra (17 pt semibold, cifre tabellari) |
| Foglio (sheet) | Modulo che sale dal basso con maniglia; in alto «Annulla» a sinistra, titolo al centro, «Salva» a destra in grassetto nel colore d'accento |
| Interruttori | Stile iOS (per «C'è la fattura») |
| Scelta della carta | Controllo a segmenti a due voci: Carta aziendale · Carta personale |
| Azioni distruttive | Rosso di sistema `#FF3B30`, mai come azione in evidenza |
| Icone | Disegnate da noi in SVG, a tratto, nello spirito di SF Symbols (le icone SF Symbols sono di Apple e non si copiano) |

## Tema

Il tema importato (vedi README) fornisce marchio e accento; la struttura sopra non cambia. Con il
tema: logo e nome in cima, accento e `accentText` per ciò che si tocca, carattere dei titoli
grandi. Senza tema: accento blu di sistema (`#007AFF`, scuro `#0A84FF`).
