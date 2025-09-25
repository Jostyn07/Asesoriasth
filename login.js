const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const redirect_URL = "./formulario.html";

// CONFIGURACIÓN EXTENDIDA PARA TOKENS DE LARGA DURACIÓN
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutos de margen
const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000; // Refrescar cada 30 minutos

let tokenClient;
let accessToken = null;
let refreshToken = null;
let tokenExpiryTime = null;

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    setTimeout(() => {
        if (document.body.contains(messageDiv)) {
            document.body.removeChild(messageDiv);
        }
    }, 3000);
}

// Función mejorada para manejar la respuesta de autenticación
function handleAuthResponse(response) {
    if (response.error) {
        console.error("Error de autenticación:", response.error);
        showMessage("Error de autenticación. Por favor, inténtalo de nuevo.", "error");
        return;
    }

    accessToken = response.access_token;
    
    // Calcular tiempo de expiración con margen de seguridad
    const expiresIn = (response.expires_in || 3600) * 1000; // Convertir a milisegundos
    tokenExpiryTime = Date.now() + expiresIn - TOKEN_EXPIRY_BUFFER;
    
    // Guardar datos de sesión con tiempo de expiración extendido
    localStorage.setItem('google_access_token', accessToken);
    localStorage.setItem('token_expiry_time', tokenExpiryTime.toString());
    localStorage.setItem('authProvider', 'google');
    localStorage.setItem('sessionActive', 'true');
    localStorage.setItem('session_start_time', Date.now().toString());

    // Si hay refresh token, guardarlo también
    if (response.refresh_token) {
        refreshToken = response.refresh_token;
        localStorage.setItem('google_refresh_token', refreshToken);
    }

    getUserInfo(accessToken).then(userInfo => {
        localStorage.setItem('google_user_info', JSON.stringify(userInfo));
        localStorage.setItem('userInfo', JSON.stringify({
            id: userInfo.sub,
            name: userInfo.name,
            email: userInfo.email,
            provider: 'google'
        }));
        
        console.log('Usuario autenticado:', userInfo.name);
        showMessage("Autenticación exitosa. Bienvenido, " + userInfo.name + "!", "success");
        
        // Configurar auto-refresh del token
        setupTokenAutoRefresh();
        
        setTimeout(() => {
            window.location.href = redirect_URL;
        }, 1500);
    }).catch(error => {
        console.error("Error al obtener información del usuario:", error);
        showMessage("Error al obtener información del usuario. Redirigiendo...", "warning");
        setTimeout(() => {
            window.location.href = redirect_URL;
        }, 1500);
    });
}

// Función para configurar el auto-refresh del token
function setupTokenAutoRefresh() {
    // Limpiar cualquier intervalo previo
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
    }
    
    // Configurar nuevo intervalo
    window.tokenRefreshInterval = setInterval(() => {
        if (isTokenNearExpiry()) {
            console.log('Token cerca de expirar, renovando automáticamente...');
            refreshAccessToken();
        }
    }, AUTO_REFRESH_INTERVAL);
}

// Verificar si el token está cerca de expirar
function isTokenNearExpiry() {
    const expiryTime = localStorage.getItem('token_expiry_time');
    if (!expiryTime) return true;
    
    return Date.now() >= (parseInt(expiryTime) - TOKEN_EXPIRY_BUFFER);
}

// Función para refrescar el token de acceso
async function refreshAccessToken() {
    try {
        console.log('Iniciando renovación de token...');
        
        // Usar el token client para obtener un nuevo token
        if (tokenClient) {
            tokenClient.requestAccessToken({
                prompt: 'none' // No mostrar popup si ya está autenticado
            });
        } else {
            console.warn('Token client no disponible, re-autenticando...');
            initiateLogin();
        }
    } catch (error) {
        console.error('Error renovando token:', error);
        // Si falla la renovación, re-autenticar
        localStorage.setItem('sessionActive', 'false');
        showMessage("Sesión expirada. Redirigiendo al login...", "warning");
        setTimeout(() => {
            window.location.href = "./index.html";
        }, 2000);
    }
}

// Obtener información del usuario con reintentos
async function getUserInfo(accessToken, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: {
                    'authorization': `Bearer ${accessToken}`
                }
            });
            
            if (response.status === 401 && i < retries - 1) {
                console.log(`Intento ${i + 1} falló, reintentando...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error en getUserInfo (intento ${i + 1}):`, error);
            if (i === retries - 1) {
                // Último intento fallido, devolver datos por defecto
                return {
                    name: "Usuario",
                    email: "usuario@email.com",
                    sub: "unknown"
                };
            }
        }
    }
}

// Función mejorada para iniciar el proceso de autenticación
function initiateLogin() {
    if (!tokenClient) {
        showMessage("Sistema de autenticación no disponible.", "error");
        return;
    }
    
    try {
        // Solicitar token con configuración para sesiones largas
        tokenClient.requestAccessToken({
            prompt: 'select_account', // Permitir seleccionar cuenta
            include_granted_scopes: true, // Incluir scopes previamente otorgados
            enable_granular_consent: true // Habilitar consentimiento granular
        });
    } catch (error) {
        console.error("Error al solicitar el token de acceso:", error);
        showMessage("Error al iniciar sesión. Por favor, inténtalo de nuevo.", 'error');
    }
}

// Función mejorada para verificar sesión existente
function checkExistingAuth() {
    const sessionActive = localStorage.getItem('sessionActive');
    const authProvider = localStorage.getItem('authProvider');
    const userInfo = localStorage.getItem('userInfo');
    const tokenExpiry = localStorage.getItem('token_expiry_time');
    
    if (sessionActive === 'true' && authProvider && userInfo) {
        if (authProvider === 'google') {
            const googleToken = localStorage.getItem('google_access_token');
            
            // Verificar si el token aún es válido
            if (googleToken && tokenExpiry) {
                const isExpired = Date.now() >= parseInt(tokenExpiry);
                if (!isExpired) {
                    // Token válido, configurar auto-refresh
                    accessToken = googleToken;
                    tokenExpiryTime = parseInt(tokenExpiry);
                    setupTokenAutoRefresh();
                    return true;
                }
            }
        } else if (authProvider === 'microsoft') {
            return checkMicrosoftAuth();
        }
    }
    
    return false;
}

// Función para cerrar sesión mejorada
function signOut() {
    // Limpiar intervalo de auto-refresh
    if (window.tokenRefreshInterval) {
        clearInterval(window.tokenRefreshInterval);
    }
    
    // Limpiar toda la información de sesión
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_refresh_token');
    localStorage.removeItem('google_user_info');
    localStorage.removeItem('token_expiry_time');
    localStorage.removeItem('session_start_time');
    localStorage.removeItem('authProvider');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('sessionActive');
    localStorage.removeItem('msAccessToken');
    
    accessToken = null;
    refreshToken = null;
    tokenExpiryTime = null;
    
    showMessage("Sesión cerrada exitosamente", "success");
    
    setTimeout(() => {
        window.location.href = "./index.html";
    }, 1000);
}

// Inicialización mejorada
window.onload = () => {
    if (checkExistingAuth()) {
        console.log("Sesión activa encontrada. Redirigiendo al usuario...");
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        showMessage(`Bienvenido de nuevo, ${userInfo.name}!`, "success");
        setTimeout(() => {
            window.location.href = redirect_URL;
        }, 1000);
        return;
    }
    
    if (typeof google === 'undefined') {
        showMessage("Google API no disponible. Por favor, inténtalo de nuevo más tarde.", "error");
        return;
    }

    try {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: handleAuthResponse,
            // Configuraciones adicionales para sesiones extendidas
            include_granted_scopes: true,
            enable_granular_consent: true
        });
    } catch (error) {
        console.error("Error al inicializar el cliente de Google:", error);
        showMessage("Error al iniciar sistema de autenticación.", 'error');
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            initiateLogin();
        });
        console.log("Botón de inicio de sesión configurado.");
    }

    const outlookBtn = document.getElementById('outlookSignInBtn');
    if (outlookBtn) {
        outlookBtn.addEventListener('click', signInWithMicrosoft);
    }
}

// Exportar funciones para uso global
window.signOut = signOut;
window.checkExistingAuth = checkExistingAuth;
window.refreshAccessToken = refreshAccessToken;
