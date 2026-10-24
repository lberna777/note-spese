import type { Theme } from '../theme';

// Marchio in alto: il logo, oppure, se manca, il nome breve dell'azienda in maiuscoletto; col tema neutro non compare.
export function BrandBar(props: { theme: Theme }) {
  const { logo, companyName, shortName } = props.theme;
  if (!logo && !companyName) return null;
  return (
    <div class="brand-bar" data-testid="brand-bar">
      {logo ? <img src={logo} alt="" class="brand-logo" /> : null}
      {/* Con il logo il nome sarebbe un doppione: si mostra solo se manca il logo. */}
      {companyName && !logo ? <span class="brand-name lbl">{shortName || companyName}</span> : null}
    </div>
  );
}
