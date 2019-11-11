// Models
var UserModel = require('../models/user.model');

// JWT y Passwords
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var SEED = require('../config/config').SEED;

// Google Login 
var GOOGLE_CLIENT_ID = require('../config/config').GOOGLE_CLIENT_ID;
const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// ==================================================
// Autenticación Google
// ==================================================
function updateToken(req, res){
    // app.get('/renuevatoken', mdAuth.verificaToken, (req, res) => {
    
        // tengo que generar un NUEVO TOKEN a partir de el usuario de la respuesta 
        var token = jwt.sign({ usuario: req.usuario }, SEED, {expiresIn: 14400} ); // Expira en 4 Horas.
    
        res.status(200).json({
            ok: true,
            usuario: req.usuario,
            newtoken: token // El nuevo token generado por jwt
                // Este usuario esta generado en el middleware verificaToken 
            // req.usuario = decoded.usuario;
        });
    }
    
    // ==================================================
    // Autenticación Google
    // ==================================================
    async function verify(token) {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID  // Specify the GOOGLE_CLIENT_ID of the app that accesses the backend
            // Or, if multiple clients access the backend:
            //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
        });
        const payload = ticket.getPayload();
        // const userid = payload['sub'];
        // If request specified a G Suite domain:
        //const domain = payload['hd'];
        return {
            nombre: payload.name,
            email: payload.email,
            img: payload.picture,
            google: true,
            payload: payload
        };
      }
    
    async function loginGoogle(req, res){
    // app.post('/google', (req, res) => {
    // app.post('/google', async(req, res) => { //async para poder usar el await verify(token) tengo que usar el async
        var token = req.body.token;
        // El token que me viene en el BODY, es el token que recibio el frontend desde google, y que ahora lo envía al backend para recibirlo aca.
    
    
    
        var googleUser = await verify(token) // devuelve una promesa
        
        .catch( err => {
            res.status(403).json({ // ERROR DE BASE DE DATOS
                ok: false,
                mensaje: 'Token no valido',
                error: err
            }); 
        });
    
        // si la promesa no devuelve error busco el usuario en la base de datos.
        UserModel.findOne({email: googleUser.email}, (err, usuarioDB) => {
            console.log('Buscando al usuario de GOOGLE en la base de datos...');
            if(err){
                res.status(500).json({ // ERROR DE BASE DE DATOS
                    ok: false,
                    mensaje: 'Error al buscar usuario',
                    error: err
                }); 
            }
    
            // Si el usuario existe, tengo que saber si fue guardado con autenticación de Google. 
            // Para esto tengo que crear un flag en el modelo de datos de usuarios.
            if(usuarioDB){
                console.log('El usuario existe..');
    
                if(usuarioDB.google === false){
                    console.log('Pero fue ingresado por autenticación normal, debe autenticar normalmente...');
                    return res.status(400).json({ // Bad Request, el usuario existe, pero fue creado desde la app y no con Login de Google.
                        ok: false,
                        mensaje: 'Debe usar su autenticación normal.',
                        error: err
                    });             
                } else {
                    console.log('Fue ingresado por autenticación de GOOGLE, hay que generar un nuevo TOKEN...');
    
                    // Debo reautenticar con Google generando un NUEVO TOKEN, utilizando el mismo metodo que en la autenticación NORMAL.
    
                    var token = jwt.sign({ usuario: usuarioDB }, SEED, {expiresIn: 14400} ); // Expira en 4 Horas.
    
                    usuarioDB.password = ':)'; // Por seguridad, no devuelvo el passord (es el encriptado, pero no importa es inseguro iugal).
                    res.status(200).json({
                        ok: true,
                        mensaje: 'Login post recibido.',
                        token: token,
                        id: usuarioDB.id,
                        usuario: usuarioDB,
                        menu: obtenerMenu( usuarioDB.role )
                    });
    
                }
    
            } else {
                console.log('el usuario no existe, hay que crearlo');
    
                // el usuario no existe, hay que crearlo.
                var usuario = new UserModel();
    
                usuario.email = googleUser.email;
                usuario.nombre = googleUser.nombre;
                usuario.email = googleUser.email;
                usuario.img = googleUser.img;
                usuario.google = true;
                usuario.password = ':)'; // se va a grabar asi, pero cuando se autentica va a pasar a un hash.
                console.log('Nuevo objeto usuario', usuario);
                usuario.save((err, usuarioDB) => {
                    if(err){
                        console.log(err);
                    }
                    var token = jwt.sign({ usuario: usuarioDB }, SEED, {expiresIn: 14400} ); // Expira en 4 Horas.
                    console.log('Nuevo usuario creado', usuarioDB);
                    res.status(200).json({
                        ok: true,
                        token: token,
                        mensaje: { message: 'OK LOGUEADO '},
                        usuario,
                        menu: obtenerMenu( usuarioDB.role )
                    });
                });
            }
        });
    
        // res.status(200).json({ // ERROR DE BASE DE DATOS
        //     ok: true,
        //     mensaje: googleUser
        // });
    }
    
    
    // ==================================================
    // Autenticación Normal 
    // ==================================================
    
    // app.post('/', (req, res) => {
    function login(req, res) {
        var body = req.body;
        console.log(body);
    
        UserModel.findOne({email: body.email}, (err, usuarioDB) => {
            if(err){
                return res.status(500).json({ // ERROR DE BASE DE DATOS
                    ok: false,
                    mensaje: 'Error al buscar un usuario',
                    errors: err
                });
            }
    
            if(!usuarioDB){
                return res.status(400).json({ // ERROR DE BASE DE DATOS
                    ok: false,
                    mensaje: 'Credenciales incorrectas - email',
                    errors: err
                }); 
            }
    
            // encrypta el password que viene por POST body.password y lo compara con el password ya encriptado en la base de datos. 
            if ( !bcrypt.compareSync( body.password, usuarioDB.password)){
                return res.status(400).json({ // ERROR DE BASE DE DATOS
                    ok: false,
                    mensaje: 'Credenciales incorrectas - password',
                    errors: err
                }); 
            }
    
            // Si llego hasta acá, el usuario y la contraseña son correctas. 
            // CREAR TOKEN!
            // la data que quiero meter en el token se conoce como PAYLOAD. En este caso, lo que voy a meter en el PAYLOAD es TODO 
            // EL OBJETO que me devuelve de la base de datos con la info de ese usuario.
            var token = jwt.sign({ usuario: usuarioDB }, SEED, {expiresIn: 14400} ); // Expira en 4 Horas.
    
            usuarioDB.password = ':)'; // Por seguridad, no devuelvo el password (es el encriptado, pero no importa es inseguro iugal).
            res.status(200).json({
                ok: true,
                mensaje: 'Login post recibido.',
                token: token,
                body: body,
                id: usuarioDB._id,
                usuario: usuarioDB,
                menu: obtenerMenu( usuarioDB.role )
            });
        });
        
    }
    
    
    function obtenerMenu(ROLE){
        var menu = [
            {
              titulo: 'Principal',
              icono: 'mdi mdi-gauge',
              submenu: [
                { titulo: 'Dashboard', url: '/dashboard' },
                { titulo: 'ProgressBar', url: '/progress' },
                { titulo: 'Gráficas', url: '/graficas1' },
                { titulo: 'Promesas', url: '/promesas' },
                { titulo: 'RXJS', url: '/rxjs' }
              ]
            },
            {
              titulo: 'Mantenimiento',
              icono: 'mdi mdi-folder-lock-open',
              submenu: [
              //  { titulo: 'Usuarios', url: '/usuarios' },
                { titulo: 'Medicos', url: '/medicos' },
                { titulo: 'Hospitales', url: '/hospitales' }
              ]
            }
          ];
    
          console.log(ROLE);
          if(ROLE === 'ADMIN_ROLE'){
              menu[1].submenu.unshift({ titulo: 'Usuarios', url: '/usuarios' }) // unshift lo coloca al princio del array, push lo coloca al final.
          }
        return menu;
    }

module.exports = {updateToken, login, loginGoogle};