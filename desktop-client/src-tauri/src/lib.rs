use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder,
};

#[cfg(feature = "pos")]
const APP_URL: &str = "https://aetherp.online/pos";
#[cfg(not(feature = "pos"))]
const APP_URL: &str = "https://aetherp.online/dashboard";
#[cfg(feature = "pos")]
const APP_TITLE: &str = "Aether POS";
#[cfg(not(feature = "pos"))]
const APP_TITLE: &str = "Aether ERP";
#[cfg(not(feature = "pos"))]
const USER_AGENT: &str = concat!("Mozilla/5.0 AetherDesktop/", env!("CARGO_PKG_VERSION"));

fn is_local_ui_url(url: &tauri::Url) -> bool {
    (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || ((url.scheme() == "http" || url.scheme() == "https")
            && url.host_str() == Some("tauri.localhost"))
}

/// Reconstruye la ventana "main" apuntando a la app remota o a la
/// pantalla local de sin conexión, y cierra la ventana de splash si sigue
/// abierta. Se reconstruye en vez de navegarse in-place para no depender de
/// la resolución manual de la URL de un recurso local empaquetado.
fn build_main_window(app: &AppHandle, mode: &str) -> tauri::Result<()> {
    if let Some(existing) = app.get_webview_window("main") {
        let _ = existing.close();
    }

    let target = if mode == "offline" {
        WebviewUrl::App("offline.html".into())
    } else {
        WebviewUrl::External(APP_URL.parse().expect("APP_URL inválida"))
    };

    let builder = WebviewWindowBuilder::new(app, "main", target)
        .title(APP_TITLE)
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0);
    // POS uses the native WebView2/WKWebView UA for login/Turnstile compatibility.
    // Its dedicated /pos entry determines the destination without a UA marker.
    #[cfg(not(feature = "pos"))]
    let builder = builder.user_agent(USER_AGENT);
    let window = builder.build()?;

    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }

    window.show()?;
    window.set_focus()?;
    Ok(())
}

/// Solo las pantallas locales de arranque pueden reemplazar la ventana.
/// Una pérdida de red con la caja abierta NUNCA destruye la webview: conserva
/// el carrito y el resultado pendiente de una venta hasta verificarlo en ERP.
#[tauri::command]
async fn switch_main_window(app: AppHandle, window: tauri::WebviewWindow, mode: String) -> Result<(), String> {
    if !is_local_ui_url(&window.url().map_err(|e| e.to_string())?) {
        return Err("Solo la pantalla local puede cambiar la ventana".into());
    }
    if mode != "app" && mode != "offline" {
        return Err("Modo de ventana inválido".into());
    }
    if let Some(main) = app.get_webview_window("main") {
        if !is_local_ui_url(&main.url().map_err(|e| e.to_string())?) {
            return Err("La aplicación ya está abierta".into());
        }
    }
    build_main_window(&app, &mode).map_err(|e| e.to_string())
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
        let handle = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _ = build_main_window(&handle, "app");
        });
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
                .title(APP_TITLE)
                .initialization_script(format!("window.__aetherAppTitle = '{}';", APP_TITLE))
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
                .tooltip(APP_TITLE)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_packaged_pages_can_replace_the_app_window() {
        for url in ["tauri://localhost/offline.html", "http://tauri.localhost/splash.html", "https://tauri.localhost/offline.html"] {
            assert!(is_local_ui_url(&url.parse().unwrap()), "{}", url);
        }
        for url in [APP_URL, "https://aetherp.online/pos/ingresar", "https://tauri.localhost.example/offline.html", "https://localhost/offline.html", "file:///offline.html"] {
            assert!(!is_local_ui_url(&url.parse().unwrap()), "{}", url);
        }
    }

    #[test]
    fn desktop_target_and_identity_match_the_edition() {
        #[cfg(feature = "pos")]
        {
            assert_eq!(APP_URL, "https://aetherp.online/pos");
            let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.pos.conf.json")).unwrap();
            assert_eq!(config["identifier"], "com.aether.pos");
            assert_eq!(config["productName"], APP_TITLE);
        }
        #[cfg(not(feature = "pos"))]
        {
            assert_eq!(APP_URL, "https://aetherp.online/dashboard");
            assert!(USER_AGENT.contains(env!("CARGO_PKG_VERSION")));
        }
    }
}
