use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};

/// Debe coincidir con DASHBOARD_URL en src/network-check.js — no hay paso de
/// build que los mantenga sincronizados si el dominio cambia.
const DASHBOARD_URL: &str = "https://aetherp.online/dashboard";
/// Punto de Venta: el service worker del sitio lo guarda y lo sirve sin
/// conexión (ver public/sw.js en el ERP), así que se puede abrir aunque no haya red.
const POS_URL: &str = "https://aetherp.online/dashboard/pos";
const USER_AGENT: &str = "Mozilla/5.0 AetherDesktop/0.2.0";

/// Se inyecta en cada carga de página de la ventana "main" — tanto el
/// dashboard remoto como `offline.html` local — para que la app misma
/// reaccione a los eventos online/offline del navegador y recupere el shell
/// sola, sin que la persona tenga que hacer nada. Esto NO sincroniza datos
/// (eso queda para una etapa aparte): solo evita que la ventana se quede
/// mostrando el error de red genérico del sistema operativo.
const CONNECTIVITY_WATCH_SCRIPT: &str = r#"
(function () {
  if (window.__aetherConnectivityWatch) return;
  window.__aetherConnectivityWatch = true;
  var local = window.location.protocol !== 'https:';
  window.addEventListener('offline', function () {
    // El POS sigue funcionando sin conexión: no se lo tapa con la pantalla local.
    if (!local && window.location.pathname.indexOf('/dashboard/pos') === 0) return;
    window.__TAURI__.core.invoke('switch_main_window', { mode: 'offline' }).catch(function () {});
  });
  window.addEventListener('online', function () {
    // Solo la pantalla local vuelve al ERP; una página del ERP ya abierta no
    // se recarga (perdería lo que la persona estaba haciendo).
    if (!local) return;
    window.__TAURI__.core.invoke('switch_main_window', { mode: 'app' }).catch(function () {});
  });
})();
"#;

/// Reconstruye la ventana "main" apuntando al dashboard remoto o a la
/// pantalla local de sin conexión, y cierra la ventana de splash si sigue
/// abierta. Se reconstruye en vez de navegarse in-place para no depender de
/// la resolución manual de la URL de un recurso local empaquetado.
fn build_main_window(app: &AppHandle, mode: &str) -> tauri::Result<()> {
    if let Some(existing) = app.get_webview_window("main") {
        let _ = existing.close();
    }

    let target = match mode {
        "offline" => WebviewUrl::App("offline.html".into()),
        "pos" => WebviewUrl::External(POS_URL.parse().expect("POS_URL inválida")),
        _ => WebviewUrl::External(DASHBOARD_URL.parse().expect("DASHBOARD_URL inválida")),
    };

    let window = WebviewWindowBuilder::new(app, "main", target)
        .title("Aether ERP")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .user_agent(USER_AGENT)
        .initialization_script(CONNECTIVITY_WATCH_SCRIPT)
        .build()?;

    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }

    window.show()?;
    window.set_focus()?;
    Ok(())
}

/// Invocado desde `splash.html` (decisión inicial) y desde `offline.html` /
/// el script de arriba (reconexión). `mode` es "app", "offline" o "pos" —
/// nunca una URL arbitraria: el frontend no elige a dónde navega la ventana,
/// solo entre estos destinos fijos conocidos en tiempo de compilación.
#[tauri::command]
fn switch_main_window(app: AppHandle, mode: String) -> Result<(), String> {
    let mode = match mode.as_str() {
        "offline" => "offline",
        "pos" => "pos",
        _ => "app",
    };
    build_main_window(&app, mode).map_err(|e| e.to_string())
}

/// Usada por el ícono de la bandeja del sistema (menú "Mostrar Aether" y
/// clic izquierdo) — no se invoca desde el frontend, así que no necesita ser
/// un `#[tauri::command]`.
fn show_and_focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        // No debería pasar (la ventana "main" se crea apenas termina el
        // splash), pero si pasa, mostramos algo en vez de no hacer nada.
        let _ = build_main_window(app, "app");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![switch_main_window])
        .setup(|app| {
            let handle = app.handle().clone();

            WebviewWindowBuilder::new(&handle, "splash", WebviewUrl::App("splash.html".into()))
                .title("Aether")
                .inner_size(360.0, 420.0)
                .resizable(false)
                .decorations(false)
                .center()
                .always_on_top(true)
                .build()?;

            let show_item = MenuItem::with_id(&handle, "show", "Mostrar Aether", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(&handle, "quit", "Salir", true, None::<&str>)?;
            let tray_menu = Menu::with_items(&handle, &[&show_item, &quit_item])?;

            let tray_icon = app
                .default_window_icon()
                .cloned()
                .expect("falta el ícono de la app (bundle.icon en tauri.conf.json)");

            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&tray_menu)
                .tooltip("Aether ERP")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => show_and_focus_main(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_and_focus_main(tray.app_handle());
                    }
                })
                .build(&handle)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
