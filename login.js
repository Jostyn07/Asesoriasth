const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
const redirect_URL = "./formulario.html"; // URL a la que redirigir después de la autenticación

let tokenClient;
let accessToken = null;
let gapi_loaded = false;

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

// función para manejar la respuesta de autenticación
function handleAuthResponse(response) {
    if (response.error) {
        console.error("Error de autenticación:", response.error);
        showMessage("Error de autenticación. Por favor, inténtalo de nuevo.", "error");
        return;
    }

    accessToken = response.access_token;
    
    // Guardar datos de sesión SIN fecha de expiración
    localStorage.setItem('google_access_token', accessToken);
    localStorage.setItem('authProvider', 'google');
    localStorage.setItem('sessionActive', 'true'); // Indicador de sesión activa

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
        setTimeout(() => {
            window.location.href = redirect_URL;
        }, 1500);
    }).catch(error => {
        console.error("Error al obtener información del usuario:", error);
        showMessage("Error al obtener información del usuario. Por favor, inténtalo de nuevo.", "error");
        setTimeout(() => {
            window.location.href = redirect_URL;
        }, 1500);
    });
}

// Obtener información del usuario
async function getUserInfo(accessToken) {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                'authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error("Error al obtener información del usuario");
        }
        return await response.json();
    } catch (error) {
        console.error("Error en la solicitud de información del usuario:", error);
        return {
            name: "Usuario",
            email: "usuario@email.com",
            sub: "unknown"
        };
    }
}

// Función para iniciar el proceso de autenticación
function initiateLogin() {
    if (!tokenClient) {
        showMessage("Sistema de autenticación no disponible.", "error");
        return;
    }
    try {
        tokenClient.requestAccessToken();
    } catch (error) {
        console.error("Error al solicitar el token de acceso:", error);
        showMessage("Error al iniciar sesión. Por favor, inténtalo de nuevo.", 'error');
    }
}

// Función para verificar si hay sesión activa (sin verificar expiración)
function checkExistingAuth() {
    const sessionActive = localStorage.getItem('sessionActive');
    const authProvider = localStorage.getItem('authProvider');
    const userInfo = localStorage.getItem('userInfo');
    
    // Solo verificar si la sesión está marcada como activa
    if (sessionActive === 'true' && authProvider && userInfo) {
        if (authProvider === 'google') {
            const googleToken = localStorage.getItem('google_access_token');
            const googleUserInfo = localStorage.getItem('google_user_info');
            return googleToken && googleUserInfo;
        } else if (authProvider === 'microsoft') {
            return checkMicrosoftAuth();
        }
    }
    
    return false;
}

// Función para cerrar sesión manualmente
function signOut() {
    // Limpiar toda la información de sesión
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_user_info');
    localStorage.removeItem('authProvider');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('sessionActive');
    localStorage.removeItem('msAccessToken');
    
    showMessage("Sesión cerrada exitosamente", "success");
    
    // Redirigir a la página de login
    setTimeout(() => {
        window.location.href = "./index.html";
    }, 1000);
}

window.onload = () => {
    // Verificar si hay sesión activa (sin verificar tiempo)
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
        });
    } catch (error) {
        console.error("Error al inicializar el cliente de Google:", error);
        showMessage("Error al iniciar sesión. Por favor, inténtalo de nuevo.", 'error');
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            initiateLogin();
        });
        console.log("Botón de inicio de sesión configurado.");
    } else {
        console.error("Botón de inicio de sesión no encontrado.");
        showMessage("Botón de inicio de sesión no disponible.", "error");
    }

    // Event listener para el botón de Outlook
    const outlookBtn = document.getElementById('outlookSignInBtn');
    if (outlookBtn) {
        outlookBtn.addEventListener('click', signInWithMicrosoft);
    }
}

// Exportar funciones para uso global
window.signOut = signOut;
window.checkExistingAuth = checkExistingAuth;