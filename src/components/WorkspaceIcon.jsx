// Small offline line icons; decorative icons never replace the existing text labels.
const paths={
 dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 registration:'M8 3H4v18h16V3h-4 M8 2h8v4H8z M8 11h8 M12 7v8 M8 18h8',
 results:'M7 3h10 M9 3v7l-5 9q-1 2 2 2h12q3 0 2-2l-5-9V3 M7 15h10',
 reports:'M5 3h11l3 3v15H5z M15 3v5h4 M8 12h8 M8 16h8',
 billing:'M5 3h14v18l-3-2-4 2-4-2-3 2z M8 8h8 M8 12h8 M8 16h4',
 referrals:'M8 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M2 19v-3q0-4 6-4q4 0 5 2 M16 4a3 3 0 0 1 0 6 M16 13q6 0 6 6 M15 17h7',
 prices:'M3 4h10l8 8-9 9-9-9z M7 8h.01 M13 11l4 4',
 settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',
 calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
 patient:'M12 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8 M4 21v-2q0-5 8-5t8 5v2',
 clock:'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M12 7v6l4 2',
};
export default function WorkspaceIcon({name}){return <svg className="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d={paths[name] || paths.reports}/></svg>;}
