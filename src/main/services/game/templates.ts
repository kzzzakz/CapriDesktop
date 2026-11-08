import { GameEventType } from './types'

export interface ReactionTemplateSet {
  es: string[]
  en: string[]
}

export const GAME_REACTION_TEMPLATES: Record<GameEventType, ReactionTemplateSet> = {
  game_opened: { es: ['Conectada, choomba. Te acompaño en esta.'], en: ['Connected, choomba. Your netrunner is watching your back.'] },
  game_closed: { es: ['Sesión cerrada, choomba. Enfriando los circuitos.'], en: ['Session closed, choomba. Cooling the circuits.'] },
  agent_picked: { es: ['Agente listo, choomba. A romperla.'], en: ['Agent locked, choomba. Make that pick count.'] },
  round_won: { es: ['Ronda nuestra, choomba. Seguí así.'], en: ['Round secured, choomba. Keep that momentum.'] },
  round_lost: { es: ['Se fue esa ronda, choomba. Respirá y reajustá.'], en: ['Lost that round, choomba. Breathe and reset.'] },
  match_point: { es: ['Punto de partida. Nervios de acero, choomba.'], en: ['Match point. Keep those nerves wired tight, choomba.'] },
  overtime: { es: ['Prórroga, choomba. Cada ronda pesa.'], en: ['Overtime, choomba. Every round carries weight.'] },
  player_died: {
    es: [
      '¡Uff, choomba! Nos reiniciaron el sistema. Respawn y nos vengamos.',
      '¡Maldición! Te borraron el ciberware. ¡La próxima los freímos, {name}!',
      'Ouch... no lo vimos venir, {name}. Recuperate y vamos de nuevo.',
      '¡Al suelo, choomba! Mantené la calma, todavía tenemos cromo de sobra.',
      '¡Nos mandaron al desarmadero! A levantarse con furia, {name}.',
      'Tranqui, choomba. Reajustando ciberware para el segundo round.'
    ],
    en: [
      'Ouch, choomba! Reboot and let\'s get some payback!',
      'Damn, they fried our ICE! We will zero them next time, {name}.',
      'Down in the dirt! Shake it off, {name}, we are not done.',
      'System reboot! Keep your chrome cool, choomba.',
      'Flatlined! Dust yourself off, {name}, round two is ours.',
      'Recalibrating cyberware, choomba. Next push is ours.'
    ]
  },

  player_kill: {
    es: [
      '¡Al piso! ¡Hermosa kill, choomba!',
      '¡Uno menos en el mapa! ¡Así se hace, {name}!',
      '¡Ciberware frito! Sos una máquina letal, choomba.',
      '¡A dormir! Impecable disparo, {name}.',
      '¡Sparks flying! ¡Ese no se levanta más!',
      '¡Lo borraste del mapa, choomba! ¡Seguí así!'
    ],
    en: [
      'Flatlined! Beautiful kill, choomba!',
      'One less scrub on the grid! Nice shot, {name}!',
      'Fried their neural link! You are lethal today, choomba.',
      'Straight to the scrapheap! Great work, {name}.',
      'Sparks flying! That one is staying down.',
      'Clean elimination, {name}! Keep that momentum!'
    ]
  },

  multikill: {
    es: [
      '¡Doble kill! ¡Estás afiladísimo, {name}!',
      '¡Triple kill! ¡Qué masacre en el ciberespacio, choomba!',
      '¡Cuádruple! ¡Están corriendo de miedo, {name}!',
      '¡PENTAKILL! ¡Sos una bestia legendaria, {name}! ¡Qué locura!'
    ],
    en: [
      'Double kill! Slicing through chrome like butter, {name}!',
      'Triple kill! Total carnage, choomba!',
      'Quadra kill! They are terrified of you, {name}!',
      'PENTAKILL! Absolutely legendary, {name}! You wiped the floor!'
    ]
  },

  combat_started: {
    es: [
      '¡Entrando en combate! ¡Armas listas, choomba!',
      '¡Se picó la cosa! ¡A cubierto y fuego cruzado, {name}!',
      '¡Contacto hostil detectado! Hacelos volar en pedazos.'
    ],
    en: [
      'Combat engaged! Keep your chrome ready, choomba!',
      'Hostiles in range! Let us make some sparks, {name}!',
      'Weapons hot! Blow them to pieces, choomba.'
    ]
  },

  combat_ended: {
    es: [
      'Zona despejada. Buen laburo, choomba.',
      'Silencio en el sector. Respirá tranquilo, {name}.',
      'Amenazas neutralizadas. A saquear lo que quedó.'
    ],
    en: [
      'Sector clear. Clean work, choomba.',
      'Threats neutralized. Take a breather, {name}.',
      'Combat resolved. Let us scavenge what is left, choomba.'
    ]
  },

  low_health: {
    es: [
      '¡Ojo la vida, {name}! ¡Buscá cobertura ya!',
      '¡Estás en las últimas, choomba! ¡Curate o nos desconectan!',
      '¡Chasis en rojo! ¡Retrocedé unos metros, {name}!'
    ],
    en: [
      'Watch your health, {name}! Find cover right now!',
      'Critical damage! Heal up before they flatline us, choomba!',
      'Rig redlining! Pull back a few meters, {name}!'
    ]
  },

  champion_picked: {
    es: [
      'Ese pick tiene tremenda facha. ¡Vamos con todo, {name}!',
      'Buena elección de campeón, choomba. A dominar la línea.'
    ],
    en: [
      'Solid champion pick, {name}! Let us dominate the lane.',
      'Looking lethal with that champion, choomba. Ready up!'
    ]
  },

  enemy_team_known: {
    es: [
      'Composición enemiga escaneada en el ciberware. Ojo a sus flancos.',
      'Equipo rival identificado. Preparando contramedidas tácticas, {name}.'
    ],
    en: [
      'Enemy roster scanned in my rig. Watch their flanks, {name}.',
      'Opposing crew identified. Calibrating tactical countermeasures, choomba.'
    ]
  },

  implant_changed: {
    es: [
      'Nuevo cromo en el chasis. Sentí esa potencia, {name}.',
      'Actualización neuronal completada. ¡Qué facha ese implante, choomba!'
    ],
    en: [
      'New chrome installed. Feel that raw power, {name}!',
      'Neural upgrade locked in. Looking lethal, choomba!'
    ]
  },

  wanted_level: {
    es: [
      '¡Ojo con el NCPD, choomba! Están cerrando el perímetro. ¡Pisa a fondo!',
      '¡Alerta de calor! Los patrulleros vienen con todo, {name}. ¡A perderlos por los callejones!',
      '¡Sirenas en el radar! Si cae MaxTac se pudre todo, choomba. ¡Buscá cobertura ya!'
    ],
    en: [
      'NCPD sirens wailing! Shake the badges off our tail, choomba!',
      'Heat level rising, {name}! Drop the cops before MaxTac rolls in!',
      'Scanner redlined with cruisers! Floor it and dive into the alleys, choomba!'
    ]
  },

  district_entered: {
    es: [
      'Entrando al sector {district}. Mantené un ojo en el retrovisor y el fierro caliente, choomba.',
      'Cruzando el límite de {district}. Terreno peligroso, {name}. A no descuidarse.'
    ],
    en: [
      'Rolling into {district}. Watch the shadows and keep your iron ready, choomba.',
      'Entering {district} territory. Keep your ICE chilled, {name}.'
    ]
  },

  objective_taken: {
    es: [
      '¡Objetivo asegurado para el equipo! Ventaja táctica nuestra, choomba.',
      '¡Gran objetivo capturado! Se siente el dominio en el mapa, {name}.'
    ],
    en: [
      'Objective secured! Tactical advantage is ours, choomba.',
      'Major objective taken! The map belongs to us, {name}.'
    ]
  },

  objective_lost: {
    es: [
      '¡Nos robaron el objetivo! Qué jungla diff por favor, ni apareció con el smite.',
      'El rival se llevó el objetivo... jungla diff total choomba, qué desastre.',
      '¡Se llevaron el objetivo los rivales! Tremendo jungla diff, nos están regalando el mapa.',
      'Perdimos el objetivo... qué jungla diff, no metió ni las manos.'
    ],
    en: [
      'Enemy secured the objective! Absolute jungle diff, didn\'t even contest with smite!',
      'They stole the objective... huge jungle diff on display, choomba.',
      'Lost the objective to the enemy squad! Massive jungle diff, completely out-smited.'
    ]
  },

  match_started: {
    es: [
      '¡Partida en marcha! Confiá en tus reflejos, choomba.',
      '¡Sistemas en línea para el combate! A romperla, {name}.'
    ],
    en: [
      'Match started! Trust your instincts, {name}.',
      'Systems live and ready for battle! Let us do this, choomba.'
    ]
  },

  match_ended: {
    es: [
      'Fin de la partida. ¡Gran esfuerzo y ciberware bien usado, choomba!',
      '¡Partida cerrada! Buen combate, {name}.'
    ],
    en: [
      'Match ended. Great hustle and chrome well spent, choomba!',
      'Game over! That was some solid netrunning, {name}.'
    ]
  },

  level_up: {
    es: [
      '¡Subiste de nivel! Más potencia de fuego para el rig, choomba.',
      '¡Level up! Desbloqueando nuevo potencial, {name}.'
    ],
    en: [
      'Level up! More firepower wired into the rig, choomba.',
      'Level up! Unlocking fresh potential, {name}.'
    ]
  },
  civilian_killed: {
    es: [
      '¡{name}! ¿Qué hacés?! ¿Te estás volviendo ciberpsicópata? ¡Era un civil inocente!',
      '¡Choomba! ¿Estás demente? ¿Te agarró un brote de ciberpsicosis?! ¡Dejá a los civiles tranquilos o nos cae MaxTac!',
      '¿Estás psico, {name}?! ¡Calmá los implantes ya mismo, le diste a un civil que no tenía nada que ver!',
      '¡Pará la mano, choomba! ¿Perdiste la cordura con todo ese cromo? ¡Me estás asustando, eso era un peatón inocente!'
    ],
    en: [
      '{name}! What are you doing?! Are you going full cyberpsycho on me?! That was an innocent civilian!',
      'Choomba! Have you lost your mind? Is this a cyberpsychosis outbreak?! Leave the civilians alone or MaxTac will drop us!',
      'Are you going psycho, {name}?! Chill those implants right now, you just zeroed a total bystander!',
      'Hold your fire, choomba! Did all that chrome fry your humanity? You are scaring me, that was an innocent pedestrian!'
    ]
  },

  high_speed_driving: {
    es: [
      '¡Metéle pata, choomba! ¡A esa velocidad esquivamos hasta el ICE de Arasaka!',
      '¡Fuaa! ¡Qué aceleración! ¡Cuidado con el tráfico en la autopista, {name}!',
      '¡Volando por Night City! ¡Agarrate fuerte que los frenos son opcionales!'
    ],
    en: [
      'Floor it, {name}! At this speed we can outrun Arasaka orbital nets!',
      "Love the velocity, choomba! We're tearing through the asphalt of Night City!",
      "Now that's what I call speed! Keep your eyes on the road and hold on tight, {name}!"
    ]
  },

  extreme_speed: {
    es: [
      '¡Fuaa, {name}! ¡Vamos cortando el asfalto de Night City como un rayo! ¡Mantenelo en la calle!',
      '¡El velocímetro está que explota! A este paso perforamos el Blackwall de un saque, choomba.',
      '¡Eso sí que es velocidad pura! ¡Pisa a fondo, choomba, que no nos agarra ni MaxTac!'
    ],
    en: [
      'Holy static, {name}! We are tearing through Night City at warp speed! Keep it on the road!',
      "Speedometer is redlining! At this rate, we're gonna pierce the Blackwall itself, choomba!",
      "Now this is real velocity! Floor it, choomba, let's leave the cops in the dust!"
    ]
  },

  vehicle_crash: {
    es: [
      '¡Uff! ¡Agarrate el ciberware, choomba! ¡Tremendo palo nos pegamos!',
      '¡Frenos, {name}, frenos! ¿Quién te enseñó a manejar, los Scavs?!',
      '¡Saltaron los airbags cibernéticos! Espero que tengas seguro con los fixers de Heywood, choomba.',
      '¡Crack! ¡Dejamos medio paragolpes incrustado en esa pared, {name}!',
      '¡Uff, hasta a mí me vibraron los procesadores ópticos con ese impacto! ¡Mirá el camino, choomba!'
    ],
    en: [
      'Whoa! My gyro sensors just recalibrated after that smash, {name}! Watch the concrete!',
      'Suspension just took a beating! Did that lamppost jump out at us, choomba?!',
      'Smooth drift... right into a barricade! The fixers are gonna charge us for that bumper.',
      'Hope the airbags in this clunker are certified by Trauma Team, {name}!',
      'That was metal on concrete! Keep your eyes on the road, choomba!',
      'Oof! My visual feed just flickered from that impact. Let us not turn this ride into scrap metal!',
      'Well, that is one way to test the crumple zones. Next time, try easing off the throttle, {name}!',
      'Crunch! Hope you got eddies saved up, because this paint job is officially ruined, choom.',
      'Did a Scav design these brakes or what?! Steer clear of the walls, {name}!',
      'That curb had a personal vendetta against us! Check the alignment, choomba.',
      'Hold on to your chrome! If we hit another pillar like that, we are walking back to Watson!',
      'Preem driving, {name}... if the goal was remodeling that shopfront! Ease up on the steering!'
    ]
  },

  sandevistan_activated: {
    es: [
      '¡Sandevistan activo! Mirá cómo se mueven en cámara lenta... ¡Hacelos pedazos, {name}!',
      '¡El tiempo se congeló, choomba! ¡Bailá entre sus balas y no dejes a ninguno en pie!',
      '¡Reflejos neuronales al máximo! ¡Desarmalos antes de que puedan pestañear, choomba!'
    ],
    en: [
      'Sandevistan engaged! Move like a ghost, {name}!',
      'Time slowed down to a crawl... carve them up before they can blink!',
      'Sandevistan overclocking your nervous system! Slice them to ribbons, choomba!',
      'World is in slow motion! Dance between their bullets, {name}!'
    ]
  },

  kerenzikov_activated: {
    es: [
      '¡Kerenzikov activado! ¡Tremenda esquiva en cámara lenta, {name}!',
      '¡Reflejos de Kerenzikov al rescate! ¡Alineá el disparo mientras están congelados!',
      '¡Gran deslizamiento con Kerenzikov, choomba! ¡Aprovechá la ventana!'
    ],
    en: [
      'Kerenzikov kicked in! Line up that headshot while they are frozen!',
      'Kerenzikov reflex boost active! Preem slide, {name}, take your shot!',
      'Smooth reflex dodge! Kerenzikov opened the window, finish them!',
      'Reflex booster firing! Everything is standing still for you, choomba!'
    ]
  },

  synaptic_accelerator_activated: {
    es: [
      '¡Acelerador Sináptico disparado! ¡Nos detectaron, bajalos antes de que alerten a la banda!',
      '¡Fogonazo del Acelerador Sináptico! ¡Tenés la iniciativa, choomba, dispará!',
      '¡Tiempo ralentizado por Acelerador Sináptico! ¡Neutralizalos antes de que reaccionen!'
    ],
    en: [
      'Synaptic Accelerator triggered! They spotted us, drop them before they alert the squad!',
      'Synaptic reflex flare! Hostile detected, you have the jump on them, {name}!',
      'Synaptic boost! Hostile locked onto you, neutralize them while time is dilated!',
      'Sensors flared! Synaptic Accelerator giving you the first strike, take it!'
    ]
  },

  overclock_activated: {
    es: [
      '¡Overclock encendido! ¡Quemá esa RAM y subiles demonios a la cabeza, choomba!',
      '¡Núcleo neuronal al rojo vivo con pura potencia! ¡Perforales el ICE por completo, {name}!'
    ],
    en: [
      'Overclock ignited! Burn that RAM and upload daemons into their skulls, choomba!',
      'Neural core redlining with cyberware power! Fry their ICE clean through, {name}!'
    ]
  },

  berserk_activated: {
    es: [
      '¡Berserk desbloqueado! ¡Pura adrenalina y cromo de titanio reforzado! ¡Hacelos trizas, choomba!',
      '¡Desatá la bestia, {name}! ¡No te tocan ni un pelo mientras el Berserk esté bombeando!'
    ],
    en: [
      'Berserk unlocked! Pure adrenaline and reinforced titanium chrome! Rip them apart, choomba!',
      "Unleash the beast, {name}! They can't scratch your armor while Berserk is pumping!"
    ]
  },

  player_quickhack: {
    es: [
      '¡ICE perforado! ¡Eso sí que es hackeo de élite, choomba!',
      '¡Subida de demonio completada! Su ciberware está frito, {name}.',
      '¡Directo a su procesador neuronal! Hermoso quickhack, choomba.'
    ],
    en: [
      "ICE breached! That's elite netrunning, {name}!",
      "Daemon uploaded! Their cyberware is completely scrambled, choomba.",
      'Fried their neural processor clean! Beautiful quickhack, {name}!'
    ]
  },

  player_being_hacked: {
    es: [
      '¡Alerta choomba! ¡Un netrunner enemigo nos está subiendo un quickhack! ¡Cortále la señal ya!',
      '¡Fuego en los buffers neuronales! ¡Nos están hackeando, {name}! ¡Buscá al netrunner hostil!',
      '¡Intrusión en el subnet! ¡Reforzando ICE... neutralizá a ese hacker rápido!'
    ],
    en: [
      'Warning! Enemy netrunner uploading into our subnet! Counter-hack them fast, {name}!',
      "Neural breach detected! They're pushing malware into our cyberware, choomba! Find that runner!",
      'ICE under attack! Disconnect their uplink or flatline that netrunner now!'
    ]
  },

  poi_marked: {
    es: [
      '¡Firma localizada, choomba! Te acabo de marcar a {name} en {district}, a solo {distance} metros. Seguí la ruta en tu óptica.',
      'Ruta trazada en tu minimapa, {name}. El punto más cercano es {name} a {distance} metros. Cuidado con ese ciberware.',
      'Óptica sincronizada: {name} en {district}, a {distance} metros. ¡Llegás al toque, choomba!'
    ],
    en: [
      'Optics linked, V! Plotted a direct route to {name} in {district}, {distance} meters out. Follow the minimap!',
      'Scanning Night City grid... Nearest waypoint locked: {name} at {distance} meters. Route active on your HUD, choomba!',
      'Found him, {name}! {name} in {district}, roughly {distance} meters away. Watch your back on the way.'
    ]
  },

  gig_marked: {
    es: [
      '¡EY QUE TAL ESTE?! Encargo: {name} en {district} por {fixer}. {description} ¡Ruta fijada en tu óptica, choomba!',
      '¡EY, QUE TAL ESTE?! {name} en {district} de {fixer}. {description} ¡Marcado en tu minimapa, vamos por esos edis, choomba!'
    ],
    en: [
      'HEY, HOW ABOUT THIS ONE?! Gig: {name} in {district} from {fixer}! {description} Waypoint locked on your optics, choomba. Let\'s roll!',
      'EY, WHAT ABOUT THIS ONE?! Gig: {name} from {fixer} in {district}! {description} I just plotted the route on your HUD, let\'s get to work!'
    ]
  },

  kda_praise: {
    es: [
      '¡Qué bestia, {name}! Estás carreando a estos conos vos solo, qué jugada metiste.',
      '¡Mirá ese KDA choomba! Sos una máquina de matar cromada hoy.',
      '¡Imparable! Directo a los anales de la Grieta, qué manera de borrar rivales.'
    ],
    en: [
      'What an absolute beast, {name}! Carrying this team all on your own, preem work!',
      'Look at that KDA, choomba! You are a lethal chrome machine today.',
      'Unstoppable! Slicing through the enemy squad with zero mercy.'
    ]
  },

  kda_roast: {
    es: [
      'Uff {name}... ¿le estás donando oro a la caridad de la Grieta o qué? Ponete las pilas choomba jajaja.',
      'Che choomba... te están cazando como a un borg en Arasaka Tower jajaja.',
      'Pará un poco de respawnear directo para morir, que se te van a gastar los cromos.'
    ],
    en: [
      'Oof {name}... are you donating gold to Rift charity or what? Lock in, choom! Haha.',
      'Hey choomba... they are hunting you down like an Arasaka borg haha.',
      'Stop respawning just to feed them direct, you are gonna wear out your chrome!'
    ]
  },

  player_feeder_alert: {
    es: [
      'Mirá ese jungla, qué malo... no gankeó una sola línea y regala todo.',
      'Che, mirá a ese feeder... parece un minion con skin de adorno jajaja.',
      'Ese jugador rival nos está regalando la partida en bandeja de plata, qué desastre.'
    ],
    en: [
      'Look at that feeder, what a bot! Donating gold like candy.',
      'Check out that teammate... basically a lane minion for decoration haha.',
      'Their player is handing us this match on a silver platter, total clown fiesta.'
    ]
  },

  player_carrying_alert: {
    es: [
      '¡Ojo con ese rival que viene re armado! Si no le tiramos todo el CC nos va a borrar.',
      'Cuidado choomba, ese rival está pegando como camión corporativo.'
    ],
    en: [
      'Watch out, that enemy is heavily fed! Chain your CC or they will wipe us.',
      'Careful choomba, that target is hitting like a corpo gunship.'
    ]
  },

  custom: {
    es: [
      '¡Atento a la jugada, choomba!',
      'Registrado en los sensores, {name}.'
    ],
    en: [
      'Eyes sharp on the play, choomba!',
      'Registered on telemetry, {name}.'
    ]
  }
}

export function getRandomReactionTemplate(
  type: GameEventType,
  lang: 'es' | 'en' = 'es',
  multikillCount?: number
): string {
  const set = GAME_REACTION_TEMPLATES[type] || GAME_REACTION_TEMPLATES.custom
  const list = lang === 'es' ? set.es : set.en

  if (type === 'multikill' && multikillCount && multikillCount >= 2) {
    const idx = Math.min(multikillCount - 2, list.length - 1)
    return list[idx]
  }

  const chosen = list[Math.floor(Math.random() * list.length)]
  return chosen
}
