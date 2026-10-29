#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicI32, Ordering};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Manager, PhysicalPosition, WindowEvent,
};

static LAST_POS: (AtomicI32, AtomicI32) = (AtomicI32::new(i32::MIN), AtomicI32::new(i32::MIN));

#[tauri::command]
fn set_widget_size(window: tauri::WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

// Put the widget 24px from the bottom-right corner using the drawn content's
// box, so window padding (GTK adds some) does not push it off the corner.
#[tauri::command]
fn snap_corner(
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let Some(monitor) = window.primary_monitor().map_err(|e| e.to_string())? else {
        return Ok(());
    };
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let screen = monitor.size();
    let margin = 24.0 * scale;
    let right = (x + width) * scale;
    let bottom = (y + height) * scale;
    window
        .set_position(PhysicalPosition::new(
            screen.width as f64 - right - margin,
            screen.height as f64 - bottom - margin,
        ))
        .map_err(|e| e.to_string())
}

// Clip the window's input region to the visible widget so the transparent
// margins pass clicks through to whatever is behind them.
#[cfg(target_os = "linux")]
#[tauri::command]
fn set_hit_rect(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    use gtk::prelude::*;
    use gtk::gdk;

    fn apply(win: &gdk::Window, x: i32, y: i32, width: i32, height: i32) {
        let region = cairo::Region::create();
        let _ = region.union_rectangle(&cairo::RectangleInt::new(x, y, width, height));
        win.input_shape_combine_region(&region, 0, 0);
        for child in win.children() {
            let (cx, cy) = child.position();
            apply(&child, x - cx, y - cy, width, height);
        }
    }

    let gtk_window = window.gtk_window().map_err(|e| e.to_string())?;
    let gdk_window = gtk_window.window().ok_or("window not mapped")?;
    apply(&gdk_window, x, y, width, height);
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn set_hit_rect(
    _window: tauri::WebviewWindow,
    _x: i32,
    _y: i32,
    _width: i32,
    _height: i32,
) -> Result<(), String> {
    Ok(())
}

// Dragging is done here rather than through the window manager so the widget can
// show its own grab cursor. Positions come from the X server, not the webview,
// because the webview reports stale coordinates while the window moves.
#[cfg(target_os = "linux")]
static DRAG: std::sync::Mutex<Option<((i32, i32), (f64, f64))>> = std::sync::Mutex::new(None);

#[cfg(target_os = "linux")]
fn pointer_pos() -> Option<(f64, f64)> {
    use gtk::prelude::*;
    let display = gtk::gdk::Display::default()?;
    let pointer = display.default_seat()?.pointer()?;
    let (_screen, x, y) = pointer.position();
    Some((x as f64, y as f64))
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn drag_begin(window: tauri::WebviewWindow) -> Result<(), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let pointer = pointer_pos().ok_or("no pointer")?;
    *DRAG.lock().unwrap() = Some(((pos.x, pos.y), pointer));
    Ok(())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn drag_update(window: tauri::WebviewWindow) -> Result<(), String> {
    let Some((origin, start)) = *DRAG.lock().unwrap() else {
        return Ok(());
    };
    let Some(pointer) = pointer_pos() else {
        return Ok(());
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    window
        .set_position(PhysicalPosition::new(
            origin.0 + ((pointer.0 - start.0) * scale) as i32,
            origin.1 + ((pointer.1 - start.1) * scale) as i32,
        ))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
#[tauri::command]
fn drag_end() {
    *DRAG.lock().unwrap() = None;
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn drag_begin(_window: tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn drag_update(_window: tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "linux"))]
#[tauri::command]
fn drag_end() {}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_widget_size,
            snap_corner,
            set_hit_rect,
            drag_begin,
            drag_update,
            drag_end
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // WebKitGTK reports a minimum size that blocks shrinking the widget.
                let _ = window.set_min_size(Some(tauri::LogicalSize::new(80.0, 80.0)));
                // Snapping needs the window's real size, which only arrives with the
                // resize event. Reading inner_size() here can return a stale value
                // and leave the widget drifting away from the corner at startup.
                let w = window.clone();
                window.on_window_event(move |event| {
                    if !matches!(event, WindowEvent::Resized(_)) {
                        return;
                    }
                    let Ok(Some(monitor)) = w.primary_monitor() else {
                        return;
                    };
                    // The resize event payload is unreliable on GTK (it can differ
                    // from the real size and change on every move), so read it back.
                    let Ok(size) = w.inner_size() else {
                        return;
                    };
                    let screen = monitor.size();
                    let margin = 24;
                    let (x, y) = (
                        screen.width as i32 - size.width as i32 - margin,
                        screen.height as i32 - size.height as i32 - margin,
                    );
                    if LAST_POS.0.swap(x, Ordering::SeqCst) != x
                        || LAST_POS.1.swap(y, Ordering::SeqCst) != y
                    {
                        let _ = w.set_position(PhysicalPosition::new(x, y));
                    }
                });
            }
            let toggle = MenuItemBuilder::with_id("toggle", "Show / Hide").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&toggle, &quit]).build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Mini Pomodoro");
}
