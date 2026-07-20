use std::{
    env,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{ChildStdin, Command, Stdio},
    sync::Mutex,
    thread,
};

use tauri::{AppHandle, Emitter, Manager, State};

struct SidecarState {
    stdin: Mutex<Option<ChildStdin>>,
    startup_error: Option<String>,
    latest_event: Mutex<Option<serde_json::Value>>,
}

#[tauri::command]
fn pick_project_file() -> Option<String> {
    rfd::FileDialog::new()
        .add_filter("Local SEO Auditor project", &["seocrawl"])
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned())
}

fn emit_sidecar_line(app: AppHandle, line: String) {
    match serde_json::from_str::<serde_json::Value>(&line) {
        Ok(message) => {
            if let Some(state) = app.try_state::<SidecarState>() {
                if let Ok(mut latest_event) = state.latest_event.lock() {
                    *latest_event = Some(message.clone());
                }
            }
            let _ = app.emit("sidecar-event", message);
        }
        Err(_) => {
            let _ = app.emit(
                "sidecar-event",
                serde_json::json!({
                  "id": "desktop-host",
                  "type": "error",
                  "timestamp": "desktop-host",
                  "payload": { "message": format!("Invalid sidecar message: {line}") }
                }),
            );
        }
    }
}

fn packaged_sidecar_directory(app: &AppHandle) -> Option<PathBuf> {
    let resources = app.path().resource_dir().ok()?;
    [
        resources.join("sidecar"),
        resources.join("resources").join("sidecar"),
    ]
    .into_iter()
    .find(|directory| directory.join("node").is_file() && directory.join("sidecar.cjs").is_file())
}

fn sidecar_command(app: &AppHandle) -> Result<Command, String> {
    if let Some(directory) = packaged_sidecar_directory(app) {
        let mut command = Command::new(directory.join("node"));
        command.arg(directory.join("sidecar.cjs"));
        return Ok(command);
    }

    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .map_err(|error| format!("Cannot resolve workspace root: {error}"))?;
    let pnpm = env::var("SEO_AUDITOR_PNPM").unwrap_or_else(|_| "pnpm".to_string());
    let mut command = Command::new(pnpm);
    command.current_dir(root).args([
        "--filter",
        "@seo-auditor/crawler",
        "exec",
        "tsx",
        "src/sidecar.ts",
    ]);
    Ok(command)
}

fn start_sidecar(app: &AppHandle) -> Result<SidecarState, String> {
    let mut child = sidecar_command(app)?
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Cannot start Node crawler sidecar: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or("Crawler sidecar did not expose stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Crawler sidecar did not expose stderr")?;
    let stdout_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            emit_sidecar_line(stdout_app.clone(), line);
        }
    });
    let stderr_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = stderr_app.emit(
                "sidecar-event",
                serde_json::json!({
                  "id": "desktop-host",
                  "type": "error",
                  "timestamp": "desktop-host",
                  "payload": { "message": format!("Crawler sidecar: {line}") }
                }),
            );
        }
    });
    Ok(SidecarState {
        stdin: Mutex::new(child.stdin.take()),
        startup_error: None,
        latest_event: Mutex::new(None),
    })
}

#[tauri::command]
fn send_sidecar_message(message: String, state: State<SidecarState>) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&message)
        .map_err(|error| format!("Invalid sidecar request: {error}"))?;
    let mut guard = state
        .stdin
        .lock()
        .map_err(|_| "Crawler sidecar stdin lock failed")?;
    let stdin = guard.as_mut().ok_or_else(|| {
        state
            .startup_error
            .clone()
            .unwrap_or_else(|| "Crawler sidecar is not running".to_string())
    })?;
    stdin
        .write_all(message.as_bytes())
        .map_err(|error| format!("Could not send sidecar message: {error}"))?;
    stdin
        .write_all(b"\n")
        .map_err(|error| format!("Could not delimit sidecar message: {error}"))?;
    stdin
        .flush()
        .map_err(|error| format!("Could not flush sidecar message: {error}"))
}

#[tauri::command]
fn latest_sidecar_event(state: State<SidecarState>) -> Result<Option<serde_json::Value>, String> {
    state
        .latest_event
        .lock()
        .map(|event| event.clone())
        .map_err(|_| "Crawler sidecar event lock failed".to_string())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let state = match start_sidecar(&app.handle()) {
                Ok(state) => state,
                Err(error) => {
                    eprintln!("Local SEO Auditor sidecar unavailable: {error}");
                    SidecarState {
                        stdin: Mutex::new(None),
                        startup_error: Some(error),
                        latest_event: Mutex::new(None),
                    }
                }
            };
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_sidecar_message,
            latest_sidecar_event,
            pick_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Local SEO Auditor");
}
