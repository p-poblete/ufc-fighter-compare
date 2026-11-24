// Recognisable stroke icons (24×24) for archetypes and specialties, with the label and rule shown on hover.
export interface Badge {
  label: string;
  rule: string;
  path: string;
}

export const ARCHETYPES: Record<string, Badge> = {
  Striker: { label: "Striker", rule: "Strikes landed in the top 30% of the division, takedowns below it", path: "M7 21h8v-3.5l2.2-2.2c.5-.5.8-1.2.8-1.9V9a5 5 0 0 0-5-5H9.5A4.5 4.5 0 0 0 5 8.5v4.2c0 1.3.8 2.4 2 2.9V21zM9 12.5h6M7 18h8" },
  Grappler: { label: "Grappler", rule: "Takedowns in the top 30% of the division, strikes landed below it", path: "M5.5 11h13v9.5h-13zM8 11V8a4 4 0 0 1 8 0v3M12 15v2.5" },
  Balanced: { label: "Balanced", rule: "Neither strikes nor takedowns dominate", path: "M12 4v16M7.5 20h9M5 7.5h14M5 7.5l-3 6.5a3 3 0 0 0 6 0zM19 7.5l-3 6.5a3 3 0 0 0 6 0z" },
};

export const SPECIALTIES: Record<string, Badge> = {
  ko_artist: { label: "Knockout artist", rule: "Half or more of UFC wins by KO/TKO (3 or more)", path: "M13 2L4.5 13.5H11L10 22l8.5-11.5H12z" },
  sub_specialist: { label: "Submission specialist", rule: "40% or more of UFC wins by submission (3 or more)", path: "M9.5 14.5l5-5M10.5 6.5l1.2-1.2a3.6 3.6 0 0 1 5 5l-1.2 1.2M13.5 17.5l-1.2 1.2a3.6 3.6 0 0 1-5-5l1.2-1.2" },
  heavy_hands: { label: "Heavy hands", rule: "One knockdown every two UFC fights or more", path: "M14.5 3.5l6 6-3 3-6-6zM11.5 6.5L3 15l3 3 8.5-8.5" },
  fast_starter: { label: "Fast starter", rule: "Half or more of UFC wins in round 1 (4 or more)", path: "M5 19l3-1 1-3M9 15l-3-3 6.5-7c3-1 5-1 6.5.5 1.5 1.5 1.5 3.5.5 6.5L12.5 18zM15 9.5h.01" },
  volume_striker: { label: "Volume striker", rule: "Strikes landed per minute in the top 20%", path: "M12 21.5a6.5 6.5 0 0 0 6.5-6.5c0-4-2.6-6.3-4-9.5-1 2-2.1 3-3.2 3.3.2-2.1-.8-4.2-2.1-5.3-.9 4-3.7 6.3-3.7 11.5a6.5 6.5 0 0 0 6.5 6.5z" },
  sniper: { label: "Sniper", rule: "Striking accuracy in the top 20%", path: "M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01" },
  counter_striker: { label: "Counter striker", rule: "Hard to hit and accurate, with low volume", path: "M9 14.5L4 9.5l5-5M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11" },
  brawler: { label: "Brawler", rule: "High volume while absorbing a lot (bottom 30% in strikes absorbed)", path: "M12 2.5l1.8 5.6 5.7-1.8-3.2 5 5.2 2.9-5.9.9.8 5.9-4.4-4-4.4 4 .8-5.9-5.9-.9 5.2-2.9-3.2-5 5.7 1.8z" },
  pressure_fighter: { label: "Pressure fighter", rule: "High strike volume and frequent takedowns", path: "M5 6l6 6-6 6M12.5 6l6 6-6 6" },
  wrestler: { label: "Wrestler", rule: "Takedowns per 15 minutes in the top 20%", path: "M12 3v12.5M7 10.5l5 5 5-5M4 20.5h16" },
  takedown_wall: { label: "Takedown wall", rule: "Takedown defence in the top 15%", path: "M3 5h18v14.5H3zM3 9.8h18M3 14.7h18M9 5v4.8M15 9.8v4.9M9 14.7v4.8" },
  hard_to_hit: { label: "Hard to hit", rule: "Striking defence in the top 20%", path: "M12 3l8 3v6c0 5-3.5 8.2-8 9.2-4.5-1-8-4.2-8-9.2V6z" },
  iron_chin: { label: "Iron chin", rule: "Never stopped by KO/TKO in 8 or more UFC fights", path: "M3.5 7.5h12.5l4.5 3.5h-4.5l-1.2 3.5H8.2L7 11H3.5zM9 14.5v4M15 14.5v4M6.5 18.5h11" },
  goes_distance: { label: "Goes the distance", rule: "60% or more of fights end in a decision (5 or more)", path: "M12 21.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9.5v4l2.5 2M10 2.5h4M18.5 6l1.3-1.3" },
};

export const svgIcon = (path: string, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
