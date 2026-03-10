## Monitoring and Manual Control

**US-01 — Critical Scalar Monitoring (REST)** As a habitat operator, I want to monitor the greenhouse_temperature, entrance_humidity, co2_hall, and corridor_pressure in real-time on a single dashboard panel so I can ensure baseline life support is stable.
REST Sensors · rest.scalar.v1

**US-02 — Environmental Hazard Monitoring (REST)** As a safety officer, I want to track particulate (air_quality_pm25) and chemical (air_quality_voc) levels so I can protect the crew from toxic inhalation and off-gassing.
REST Sensors · rest.particulate.v1, rest.chemistry.v1

**US-03 — Resource Level Monitoring (REST)** As a habitat operator, I want to monitor the water_tank_level so I can anticipate shortages and schedule water reclamation before reserves run critically low.
REST Sensors · rest.level.v1

**US-04 — Thermal Loop Diagnostics (Stream)** As a mission engineer, I want to view a real-time line chart of the thermal_loop temperature and flow rate so I can detect cooling circuit failures before they overheat the habitat.
Telemetry · topic.thermal_loop.v1

**US-05 — Power Grid Monitoring (Stream)** As a mission engineer, I want to monitor the power_bus and power_consumption streams so I can identify voltage irregularities and prevent rolling blackouts.
Telemetry · topic.power.v1

**US-06 — Airlock & External Hazard Tracking (Stream)** As a safety officer, I want to monitor airlock status and external radiation so I can ensure EVAs are safe and warn the crew during solar particle events.
Telemetry · topic.airlock.v1, topic.environment.v1

**US-07 —** Cooling Fan Manual Control As a habitat operator, I want a dashboard toggle to manually switch the cooling_fan ON/OFF so I can immediately reduce heat without waiting for automation rules to trigger.
Actuator · POST /api/actuators/cooling_fan

**US-08 —** Entrance Humidifier Manual Control As a habitat operator, I want a manual toggle for the entrance_humidifier so I can adjust moisture levels when the crew reports dry air discomfort.
Actuator · POST /api/actuators/entrance_humidifier

**US-09 —** Hall Ventilation Manual Control As a safety officer, I want a manual toggle for hall_ventilation so I can quickly flush elevated CO2 concentrations from the habitat.
Actuator · POST /api/actuators/hall_ventilation

**US-10** — Habitat Heater Manual Control As a habitat operator, I want a manual toggle for the habitat_heater so I can prevent the crew from freezing during extreme Martian temperature drops.
Actuator · POST /api/actuators/habitat_heater

## Automation Rules

**US-11 — Rule Builder Interface (UI)** As a system administrator, I want a dashboard form to create new automation rules using the format IF - THEN set  to ON/OFF so the system can manage devices automatically.
Rule Engine UI

**US-12 — Active Rules List (UI)** As a system administrator, I want to view a list of all persisted automation rules on the dashboard so I know exactly what logic is currently running on the habitat.
Rule Engine UI

**US-13 — Rule Deletion/Toggle (UI)** As a system administrator, I want to be able to delete or disable an active rule from the dashboard so I can stop faulty automation logic during a hardware sensor failure.Rule Engine UI

**US-14** — Automated Heat Mitigation As a botanist, I want the system to automatically evaluate IF `greenhouse_temperature > 24 °C THEN set cooling_fan to ON` so my crops survive heat spikes while I am asleep.
Rule Engine Backend

**US-15** — Automated Heat Stabilization As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature < 22 °C THEN set cooling_fan to OFF` so the fan doesn’t waste power once the temperature normalizes.Rule Engine Backend

**US-16** — Emergency CO2 Venting As a safety officer, I want the system to automatically evaluate `IF co2_hall > 900ppm THEN set hall_ventilation to ON` to automatically protect the crew from asphyxiation.
Rule Engine Backend

**US-17** — CO2 Venting Deactivation As a safety officer, I want the system to automatically evaluate `IF co2_hall < 600ppm THEN set hall_ventilation to OFF` so we don’t unnecessarily vent our internal atmosphere into space once levels are safe.
Rule Engine Backend

**US-18** — Automated Cold Survival As a crew member, I want the system to automatically evaluate `IF thermal_loop < 10°C THEN set habitat_heater to ON` so the habitat is warmed automatically during a frigid Martian night.
Rule Engine Backend

**US-19** — Automated Dryness Mitigation As a habitat operator, I want the system to evaluate `IF entrance_humidity < 40% THEN set entrance_humidifier to ON` to prevent the extreme dry air from cracking the entrance airlock seals. 
Rule Engine Backend

**US-20** — Persistence During Outages As a mission engineer, I want the automation engine to load all my saved rules from the database immediately after a container restart so the habitat doesn’t lose its safety protocols during a system crash.
Rule Engine Backend · Database