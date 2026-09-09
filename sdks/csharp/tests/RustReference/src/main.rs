use siming_core::{
    SimulationAction, SimulationLogKind, SimulationRequest, SimulationStatus, simulate_step,
};
use std::io::{self, Read};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let input: serde_json::Value = serde_json::from_str(&input)?;
    let mut request: SimulationRequest = serde_json::from_value(input["request"].clone())?;
    let choice = input["choice"].as_str().ok_or("missing choice")?;
    let mut session = simulate_step(request.clone())?;
    for _ in 0..100 {
        request.action = match session.status {
            SimulationStatus::WaitingContinue => SimulationAction::Continue,
            SimulationStatus::WaitingChoice => SimulationAction::Choose {
                option_id: choice.to_owned(),
            },
            SimulationStatus::Completed => break,
            _ => return Err("unexpected simulation status".into()),
        };
        request.session = Some(session);
        session = simulate_step(request.clone())?;
    }
    if session.status != SimulationStatus::Completed {
        return Err("reference did not complete".into());
    }
    let nodes: Vec<_> = session
        .trace
        .iter()
        .filter(|e| e.kind == SimulationLogKind::Node)
        .map(|e| e.node_key.clone())
        .collect();
    let hosts: Vec<_> = session
        .trace
        .iter()
        .filter(|e| e.kind == SimulationLogKind::HostEvent)
        .map(|e| e.details["event"]["name"].clone())
        .collect();
    let business: Vec<_> = session
        .trace
        .iter()
        .filter(|e| e.kind == SimulationLogKind::BusinessEvent)
        .map(|e| e.details["event"].clone())
        .filter(|name| name != "variable.set" && name != "variable.add")
        .collect();
    println!(
        "{}",
        serde_json::json!({ "name": choice, "choices": [choice], "nodes": nodes, "hostEvents": hosts, "businessEvents": business, "variables": session.variables })
    );
    Ok(())
}
