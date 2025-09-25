// Configuración de Microsoft Graph API
const msalConfig = {
    auth: {
        clientId: "TU_CLIENT_ID_AQUI", // Deberás obtenerlo de Azure Portal
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin + "/index.html"
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false
    }
};

// Scopes (permisos) que solicitaremos
const loginRequest = {
    scopes: ["User.Read", "Mail.Read"]
};

// Inicializar MSAL
let msalInstance;

try {
    msalInstance = new msal.PublicClientApplication(msalConfig);
} catch (error) {
    console.error("Error inicializando MSAL:", error);
}

// Función para iniciar sesión con Microsoft
async function signInWithMicrosoft() {
    if (!msalInstance) {
        showMessage("Error: Microsoft Auth no está configurado", "error");
        return;
    }

    const signInButton = document.getElementById('outlookSignInBtn');
    signInButton.classList.add('btn-loading');
    signInButton.textContent = 'Iniciando sesión...';

    try {
        showMessage("Iniciando sesión con Microsoft...", "info");

        const response = await msalInstance.loginPopup(loginRequest);
        
        console.log("Respuesta de Microsoft:", response);
        
        // Extraer información del usuario
        const userInfo = {
            id: response.account.localAccountId,
            name: response.account.name,
            email: response.account.username,
            provider: 'microsoft',
            accessToken: response.accessToken
        };

        // Guardar información del usuario SIN tiempo límite
        localStorage.setItem('authProvider', 'microsoft');
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        localStorage.setItem('msAccessToken', response.accessToken);
        localStorage.setItem('sessionActive', 'true'); // Indicador de sesión activa

        showMessage(`¡Bienvenido, ${userInfo.name}!`, "success");

        // Redirigir al formulario después de 2 segundos
        setTimeout(() => {
            window.location.href = './formulario.html';
        }, 2000);

    } catch (error) {
        console.error("Error en inicio de sesión:", error);
        
        if (error.name === 'BrowserAuthError') {
            showMessage("Error: Popup bloqueado. Permite popups para este sitio.", "error");
        } else if (error.name === 'ClientAuthError') {
            showMessage("Error de configuración. Contacta al administrador.", "error");
        } else {
            showMessage("Error al iniciar sesión con Microsoft: " + error.message, "error");
        }
    } finally {
        // Restaurar botón
        signInButton.classList.remove('btn-loading');
        signInButton.innerHTML = `
            <svg class="outlook-signin-button" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7.44 6.7c-.51 0-.93.16-1.27.47-.33.32-.5.75-.5 1.28 0 .54.17.97.5 1.28.34.32.76.47 1.27.47.52 0 .94-.16 1.27-.47.33-.31.5-.74.5-1.28 0-.53-.17-.96-.5-1.28-.33-.31-.75-.47-1.27-.47zm8.8-.1h-4.47v1.2h4.47v-1.2zm0 2h-4.47v1.2h4.47v-1.2zm0 2h-4.47v1.2h4.47v-1.2z"/>
                <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM7.5 18c-1.93 0-3.5-1.57-3.5-3.5S5.57 11 7.5 11s3.5 1.57 3.5 3.5S9.43 18 7.5 18zm10.5-3h-6v-2h6v2zm0-3h-6V9h6v2zm0-3h-6V6h6v3z"/>
            </svg>
            Iniciar con Outlook
        `;
    }
}

// Función para verificar si hay sesión activa de Microsoft (sin verificar tiempo)
async function checkMicrosoftAuth() {
    if (!msalInstance) return false;

    try {
        const accounts = msalInstance.getAllAccounts();
        const sessionActive = localStorage.getItem('sessionActive');
        
        if (accounts.length > 0 && sessionActive === 'true') {
            return true;
        }
    } catch (error) {
        console.error("Error verificando auth de Microsoft:", error);
    }
    
    return false;
}

// Función para cerrar sesión de Microsoft
async function signOutMicrosoft() {
    if (!msalInstance) return;

    try {
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
            await msalInstance.logoutPopup({
                account: accounts[0]
            });
        }
        
        // Limpiar localStorage
        localStorage.removeItem('authProvider');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('msAccessToken');
        localStorage.removeItem('sessionActive');
        
    } catch (error) {
        console.error("Error cerrando sesión:", error);
    }
}

// Exportar funciones para uso global
window.signInWithMicrosoft = signInWithMicrosoft;
window.checkMicrosoftAuth = checkMicrosoftAuth;
window.signOutMicrosoft = signOutMicrosoft;