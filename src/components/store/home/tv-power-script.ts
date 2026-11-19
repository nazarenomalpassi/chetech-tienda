// Se ejecuta antes de pintar el televisor: si ya se encendió en esta visita, no se repite (E1).
export const tvPowerScript = `try{var k='chetech-tv-encendido';if(sessionStorage.getItem(k))document.documentElement.setAttribute('data-tv-visto','');sessionStorage.setItem(k,'1')}catch(e){}`;
