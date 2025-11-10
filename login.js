const clientId = '64713983477-nk4rmn95cgjsnab4gmp44dpjsdp1brk2.apps.googleusercontent.com';
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email";
const redirect_URL = "./formulario.html";

// configuaración
const LOGIN_ENDPOINT = "/api/login"
const FORMULARIO_URL = "./formulario.html"
const BACKEND_BASE_URL = "https://asesoriasth-backend-88xb.onrender.com" //Usar URL de render


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

function handleLoginResponse (token, userName) {
    localStorage.setItem('authProvider', 'local');
    localStorage.setItem('sessionActive', 'true');
    localStorage.setItem('local_jwt_token', token);
    localStorage.setItem('userInfo', JSON.stringify({ name: userName, provider:'local'}));

    showMessage(`¡Bienvenido, ${userName}!`, "success");

    setTimeout(() => {
        window.location.href = FORMULARIO_URL;
    }, 1500);
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


// Función mejorada para verificar sesión existente
function checkExistingAuth() {
    const sessionActive = localStorage.getItem('sessionActive');
    const authProvider = localStorage.getItem('authProvider');
    const localToken = localStorage.getItem('local_jwt_token');
    
    if (sessionActive === 'true' && authProvider === 'local' && localToken) {
        return true;
    }
    return false;
}

// Funcion principal de envío login
async function onSumbitLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    const sumbitBtn = document.querySelector('.btn-login');
    if (!email || !password) {
        showMessage('Por favor, ingresar email y contraseña.', 'error');
        return;
    }

    if (sumbitBtn) {
        sumbitBtn.classList.add('btn-loading');
        sumbitBtn.textContent = 'Verificando...';
    }

    try {
        const response = await fetch(`${BACKEND_BASE_URL}${LOGIN_ENDPOINT}`, {
            method: 'POST',
            headers: {
                'Content-type': 'application/json'
            },
            body: JSON.stringify({ email, password}) // Envio de credenciales
        });

        const result = await response.json();
        if (!response.ok) {
            // Error 401 que son credenciales invalidas
            throw new Error(result.error || 'Credenciales no validas.')
        }
        // Autenticación exitosa
        handleLoginResponse(result.token, result.user.name);
    } catch (error) {
        console.error("Error de login:", error.message);
        showMessage(error.message, "error");
    } finally {
        if(sumbitBtn) {
            sumbitBtn.classList.remove('btn-login');
            sumbitBtn.textContent = 'Iniciar Sesión';
        }
    }
}

//Configuración para el logout
window.signOut = () => {
    localStorage.removeItem('auth.Provider');
    localStorage.removeItem('sessionActive');
    localStorage.removeItem('local_jwt_token');
    localStorage.removeItem('userInfor');

    showMessage("Sesión cerrada", "success");

    //Redirección a login
    setTimeout(() => {
        window.location.href = "./index.html";
    }, 1000);
};

window.onload = () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', onSumbitLogin);
    }

    if (checkExistingAuth()) {
        const userInfo = JSON.parse(localStorage.getItem('userInfo'));
        showMessage(`Bienvenido de nuevo, ${userInfo?.name}!`, "success");

        setTimeout(() => {

            window. location.href = FORMULARIO_URL;
        }, 1000);
    }
};
// Exportar funciones para uso global
window.signOut = signOut;