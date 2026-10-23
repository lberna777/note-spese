import type { Theme } from '../theme';

// Barra in cima a ogni schermata con logo e nome dell'azienda del tema; col tema neutro non compare.
export function BrandBar(props: { theme: Theme }) {
  const { logo, companyName } = props.theme;
  if (!logo && !companyName) return null;
  return (
    <div class="brand-bar" data-testid="brand-bar">
      {logo ? <img src={logo} alt="" class="brand-logo" /> : null}
      {companyName ? <span class="brand-name">{companyName}</span> : null}
    </div>
  );
}
