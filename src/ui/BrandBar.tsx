import type { Theme } from '../theme';

// Riga del marchio nella barra in alto: logo e nome dell'azienda del tema; col tema neutro non compare.
// Il logo sta su una piccola targa del colore del marchio, perché i loghi dei temi sono pensati per fondi scuri.
export function BrandBar(props: { theme: Theme }) {
  const { logo, companyName } = props.theme;
  if (!logo && !companyName) return null;
  return (
    <div class="brand-bar" data-testid="brand-bar">
      {logo ? <span class="brand-chip"><img src={logo} alt="" class="brand-logo" /></span> : null}
      {companyName ? <span class="brand-name">{companyName}</span> : null}
    </div>
  );
}
