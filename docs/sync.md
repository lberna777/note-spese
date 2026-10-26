# Sincronizzazione tra dispositivi

Decisa il 2026-10-26. Lo stesso utente usa l'app sul telefono e sul computer e deve vedere gli
stessi dati. Vincoli: **gratuita**, **cifrata da un capo all'altro** (il server non può leggere
nulla), **l'app funziona anche senza rete**, collegamento con un **QR code**.

## Idea

Ogni dispositivo tiene il suo archivio (IndexedDB) come oggi. Un piccolo server (Cloudflare
Worker con database D1, piano gratuito) fa da casella di scambio: riceve e restituisce **buste
cifrate** che non sa aprire. La chiave nasce su un dispositivo e passa all'altro solo attraverso il
QR code, mai su internet.

## Chiavi

- Al primo collegamento si generano, sul dispositivo che mostra il QR:
  - `vaultId`: 16 byte casuali (identifica la casella sul server);
  - `secret`: 32 byte casuali.
- Da `secret` con HKDF-SHA-256 (Web Crypto) si ricavano:
  - `encKey` (info `note-spese/enc/v1`): chiave AES-GCM 256 per cifrare le buste;
  - `authToken` (info `note-spese/auth/v1`): 32 byte, si manda al server in `Authorization:
    Bearer`; il server ne conserva solo lo SHA-256 (lo registra alla prima scrittura, poi lo
    confronta in tempo costante);
  - `idKey` (info `note-spese/id/v1`): chiave HMAC-SHA-256 per gli identificativi opachi.
- `vaultId` e `secret` si salvano nell'archivio locale (store `sync`). «Scollega» li cancella.

## QR code

- Contenuto: `nsync1:` + base64url(`vaultId` ‖ `secret`) (48 byte → 64 caratteri), più il
  nome del dispositivo che lo mostra (per il messaggio di conferma). Nessun URL: un link aperto
  dalla fotocamera dell'iPhone finirebbe in Safari, che ha un archivio diverso dall'app installata
  sulla Home.
- **Mostra il codice** (Impostazioni → Collega un dispositivo): QR grande, scade dopo 10 minuti
  (passati i quali il dispositivo genera un nuovo segreto solo se non è già collegato), e sotto lo
  stesso codice per inserirlo a mano: base32 Crockford (O si legge 0, I e L si leggono 1), con un
  carattere di controllo finale, in 16 gruppi di 5 caratteri (l'ultimo di 3).
- **Inquadra il codice**: lettore QR dentro l'app (fotocamera con `getUserMedia`, decodifica con
  jsQR, licenza Apache-2.0), oppure campo per scrivere il codice a mano. Sul computer senza
  fotocamera si usa il campo.
- Prima di unire, conferma: «Collegare questo dispositivo a <nome>? I dati dei due dispositivi
  verranno uniti.»

## Buste

- Ogni record locale (spesa, foto, destinatario, tratta, fornitore noto, impostazioni condivise,
  tema) ha `updatedAt` (millisecondi, orologio del dispositivo) e può essere una **lapide**
  (`deleted: true`, senza contenuto) quando viene eliminato.
- Busta = AES-GCM(`encKey`, IV casuale 12 byte, JSON `{collection, id, updatedAt, deleted,
  value}`), con dato associato `vaultId` ‖ `opaqueId`.
- `opaqueId` = base64url(HMAC(`idKey`, `collection` + `/` + `id`)): il server non vede né il tipo
  né l'identificativo dei record.
- Le foto sono buste come le altre (JPEG in base64 dentro il JSON). Limite di una busta: 1,5 MB
  cifrati; oltre, la foto si riduce ancora prima di cifrarla.
- **Non si sincronizzano**: la scelta Automatico/Chiaro/Scuro e i promemoria di backup (sono del
  dispositivo), lo stato di sincronizzazione.

## Server (`worker/`)

- D1, tabella `envelopes(vault TEXT, oid TEXT, seq INTEGER, body BLOB, size INTEGER, PRIMARY KEY
  (vault, oid))` più `vaults(vault TEXT PRIMARY KEY, auth_hash BLOB, created INTEGER, seq INTEGER)`;
  `seq` cresce a ogni scrittura nella casella.
- `POST /v1/vaults/:vault/push` con `[{oid, body}]` (al massimo 50 buste o 4 MB per richiesta):
  sostituisce le buste e assegna un nuovo `seq` a ciascuna; risponde con il `seq` più alto.
- `GET /v1/vaults/:vault/pull?since=<seq>&limit=100`: buste con `seq` maggiore, in ordine, più
  `next` se ce ne sono altre.
- `DELETE /v1/vaults/:vault`: cancella la casella e tutte le buste («Elimina i dati dal server»).
- Tutte le richieste con `Authorization: Bearer <authToken>`; la prima `push` su una casella nuova
  registra l'hash. CORS solo per l'origine dell'app (`https://lberna777.github.io`) e per
  `http://localhost:*` in sviluppo. Nessun registro con contenuti o indirizzi IP.
- Limiti contro gli abusi: corpo massimo 5 MB, casella massimo 500 MB, risposta 429 se superati.

## Algoritmo sul dispositivo

1. Ogni modifica locale scrive il record con `updatedAt` = adesso e lo mette nella **coda
   d'uscita** (store `outbox`, chiave `collection/id`).
2. **Sincronizzazione** (all'apertura, 2 secondi dopo ogni modifica, al ritorno della rete, ogni 5
   minuti con l'app aperta, e con il pulsante «Sincronizza ora»):
   1. `pull` da `lastSeq` finché ce n'è: per ogni busta, decifra; se il record locale manca o ha
      `updatedAt` minore, applica (anche le lapidi: eliminano il record e, per le spese, la
      foto); se il locale è più recente, lo rimette in coda d'uscita.
   2. `push` della coda d'uscita a blocchi; svuota la coda per ciò che il server ha confermato.
   3. salva `lastSeq` e l'ora dell'ultima sincronizzazione.
3. **Primo collegamento**: il dispositivo che si collega mette in coda **tutti** i suoi record e
   poi sincronizza, così i due archivi si uniscono. I dati finti di prova non si uniscono: prima
   di collegare, se un dispositivo ha ancora i dati di prova, l'app chiede di cancellarli.
4. Le lapidi restano 90 giorni, poi si eliminano.

## Interfaccia

- Impostazioni, sezione **Dispositivi collegati**: stato («Collegato · ultima sincronizzazione
  alle 10:42», «Non collegato», «Senza rete: le modifiche partiranno appena possibile»),
  «Collega un dispositivo» (mostra il QR), «Inquadra un codice», «Sincronizza ora», «Scollega
  questo dispositivo», «Elimina i dati dal server».
- Indicatore discreto nella barra in alto: puntino d'accento mentre sincronizza, puntino grigio se
  ci sono modifiche in attesa.
- Testo informativo per l'utente: dove va la copia cifrata (server Cloudflare), che nessuno può
  leggerla senza i suoi dispositivi, e che perdendo tutti i dispositivi collegati i dati non si
  recuperano dal server (serve il backup).

## Configurazione

- Indirizzo del server in `VITE_SYNC_URL` al momento della build. Senza indirizzo la sezione
  «Dispositivi collegati» non compare e l'app resta solo locale.
- Pubblicazione del server: `wrangler` dal computer di sviluppo (`wrangler d1 create`, migrazioni,
  `wrangler deploy`), istruzioni nel README.
