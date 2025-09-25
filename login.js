const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
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
    showMessage("Iniciando sesión...", "info");
    
    // Verificar si ya hay una sesión activa
    if (localStorage.getItem('sessionActive') === 'true') {
        window.location.href = "./formulario.html";
        return;
    }
    
    // Usar el método original primero (más estable)
    if (tokenClient) {
        try {
            console.log('🚀 Iniciando login con método original...');
            tokenClient.requestAccessToken({ 
                prompt: 'consent',
                include_granted_scopes: true,
                enable_granular_consent: true
            });
        } catch (error) {
            console.error("Error con método original:", error);
            
            // Fallback al flujo OAuth2 si falla el método original
            console.log('🔄 Intentando con flujo OAuth2...');
            try {
                initiateOAuth2Flow();
            } catch (oauth2Error) {
                console.error("Error con flujo OAuth2:", oauth2Error);
                showMessage("Error: No se pudo iniciar sesión. Inténtalo de nuevo.", "error");
            }
        }
    } else {
        console.log('⚠️ TokenClient no disponible, usando flujo OAuth2...');
        try {
            initiateOAuth2Flow();
        } catch (error) {
            console.error("Error al iniciar el flujo de autenticación:", error);
            showMessage("Error: Sistema de autenticación no inicializado.", "error");
        }
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
    
    // Verificar si hay código de autorización en la URL
    checkForAuthCode();
    
    // Configurar auto-renovación de tokens
    setupAutoTokenRefresh();
}

// Función para iniciar el flujo OAuth2 completo (con refresh token)
function initiateOAuth2Flow() {
    const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
    const redirectUri = window.location.origin + '/Asesoriasth-main/index.html';
    const scope = SCOPES;
    
    console.log('🔗 Iniciando OAuth2 flow con:', {
        clientId: clientId,
        redirectUri: redirectUri,
        scope: scope
    });
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scope)}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `include_granted_scopes=true`;
    
    console.log('🌐 Redirigiendo a:', authUrl);
    window.location.href = authUrl;
}

// Función para intercambiar código por tokens
async function exchangeCodeForTokens(code) {
    try {
        const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
        const redirectUri = window.location.origin + '/Asesoriasth-main/index.html';
        
        console.log('🔄 Intercambiando código por tokens...', {
            code: code.substring(0, 10) + '...',
            clientId: clientId,
            redirectUri: redirectUri
        });
        
        // Nota: En producción, esto debe hacerse en el backend por seguridad
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code: code,
                client_id: clientId,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error en intercambio de tokens:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const tokens = await response.json();
        
        if (tokens.access_token) {
            localStorage.setItem('google_access_token', tokens.access_token);
            if (tokens.refresh_token) {
                localStorage.setItem('google_refresh_token', tokens.refresh_token);
            }
            
            // Calcular tiempo de expiración
            const expiresIn = tokens.expires_in || 3600;
            const expiresAt = Date.now() + (expiresIn * 1000);
            localStorage.setItem('token_expires_at', expiresAt.toString());
            
            console.log('Tokens obtenidos exitosamente');
            return tokens;
        }
    } catch (error) {
        console.error('Error intercambiando código por tokens:', error);
        throw error;
    }
}

// Función mejorada para refresh token
async function refreshGoogleToken() {
    const refreshToken = localStorage.getItem('google_refresh_token');
    
    if (!refreshToken) {
        console.log('No hay refresh token disponible');
        return null;
    }

    try {
        const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
        
        // Nota: En producción, esto debe hacerse en el backend por seguridad
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                refresh_token: refreshToken,
                client_id: clientId,
                grant_type: 'refresh_token'
            })
        });

        if (!response.ok) {
            console.error('Error renovando token:', response.status, response.statusText);
            
            // Si el refresh token es inválido, limpiar y re-autenticar
            if (response.status === 400) {
                localStorage.removeItem('google_refresh_token');
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('token_expires_at');
                return null;
            }
            
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const tokens = await response.json();
        
        if (tokens.access_token) {
            localStorage.setItem('google_access_token', tokens.access_token);
            
            // Actualizar tiempo de expiración
            const expiresIn = tokens.expires_in || 3600;
            const expiresAt = Date.now() + (expiresIn * 1000);
            localStorage.setItem('token_expires_at', expiresAt.toString());
            
            // Si viene un nuevo refresh token, guardarlo
            if (tokens.refresh_token) {
                localStorage.setItem('google_refresh_token', tokens.refresh_token);
            }
            
            console.log('Token renovado exitosamente');
            return tokens.access_token;
        }
        
        return null;
    } catch (error) {
        console.error('Error renovando token de Google:', error);
        return null;
    }
}

// Función para verificar si el token necesita renovarse
function needsTokenRefresh() {
    const expiresAt = localStorage.getItem('token_expires_at');
    if (!expiresAt) return true;
    
    const now = Date.now();
    const expiry = parseInt(expiresAt);
    
    // Renovar si falta menos de 5 minutos para expirar
    return (expiry - now) < (5 * 60 * 1000);
}

// Función para configurar auto-renovación de tokens
function setupAutoTokenRefresh() {
    // Verificar cada 30 minutos si el token necesita renovarse
    setInterval(async () => {
        const sessionActive = localStorage.getItem('sessionActive') === 'true';
        const accessToken = localStorage.getItem('google_access_token');
        
        if (sessionActive && accessToken && needsTokenRefresh()) {
            console.log('Auto-renovando token...');
            const newToken = await refreshGoogleToken();
            
            if (!newToken) {
                console.log('No se pudo renovar el token automáticamente');
                // Opcional: mostrar notificación al usuario
            }
        }
    }, 30 * 60 * 1000); // 30 minutos
}

// Verificar si hay código de autorización en la URL
function checkForAuthCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    if (error) {
        console.error('Error de autorización:', error);
        showMessage("Error durante la autorización: " + error, "error");
        return;
    }
    
    if (code) {
        console.log('Código de autorización recibido, intercambiando por tokens...');
        exchangeCodeForTokens(code)
            .then(tokens => {
                if (tokens && tokens.access_token) {
                    // Limpiar URL
                    window.history.replaceState({}, document.title, window.location.pathname);
                    
                    // Obtener info del usuario y configurar sesión
                    return getUserInfo(tokens.access_token);
                }
            })
            .then(userInfo => {
                if (userInfo) {
                    localStorage.setItem('sessionActive', 'true');
                    localStorage.setItem('authProvider', 'google');
                    localStorage.setItem('userInfo', JSON.stringify(userInfo));
                    
                    showMessage(`Bienvenido, ${userInfo.name || userInfo.email}!`, "success");
                    
                    setTimeout(() => {
                        window.location.href = "./formulario.html";
                    }, 1500);
                }
            })
            .catch(error => {
                console.error('Error durante el intercambio de tokens:', error);
                showMessage("Error durante la autorización. Por favor, inténtalo de nuevo.", "error");
            });
    }
}

// Exportar funciones para uso global
window.signOut = signOut;
window.checkExistingAuth = checkExistingAuth;
window.refreshAccessToken = refreshAccessToken;
window.refreshGoogleToken = refreshGoogleToken;
window.initiateOAuth2Flow = initiateOAuth2Flow;