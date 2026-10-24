// Nunito Sans (licenza OFL, vedi fonts/OFL.txt) in TTF base64 per incorporarlo nel PDF.
// Il modulo si importa solo quando si genera il PDF.
import light from './fonts/NunitoSans-Light.ttf?base64';
import regular from './fonts/NunitoSans-Regular.ttf?base64';
import semibold from './fonts/NunitoSans-SemiBold.ttf?base64';

export const NUNITO_SANS = { light, regular, semibold };
