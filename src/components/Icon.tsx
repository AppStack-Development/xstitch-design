const PATHS: Record<string, string> = {
  pencil: 'M4 20l1-4L16 5l3 3L8 19l-4 1z M14 7l3 3',
  eraser: 'M8 19h12 M4.5 13.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L10 18H8l-3.5-3.5a.7.7 0 0 1 0-1z M9 9l5 5',
  fill: 'M5 11l6-6 8 8-6 6a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8z M5 12h13 M20 16s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z',
  picker: 'M15 4.5a2.1 2.1 0 0 1 3 0l1.5 1.5a2.1 2.1 0 0 1 0 3L17 11.5 12.5 7z M13.5 8L5 16.5V19h2.5L16 10.5',
  line: 'M5 19L19 5 M5 19h.01 M19 5h.01',
  rect: 'M5 5h14v14H5z',
  hole: 'M4 4h16v16H4z M8 8h2v2H8z M14 8h2v2h-2z M8 14h2v2H8z M14 14h2v2h-2z',
  pan: 'M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M12 21l-3-3 M12 21l3-3 M3 12l3-3 M3 12l3 3 M21 12l-3-3 M21 12l-3 3',
  undo: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5 M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  mirrorX: 'M12 3v18 M9 7L4 12l5 5z M15 7l5 5-5 5z',
  mirrorY: 'M3 12h18 M7 9l5-5 5 5z M7 15l5 5 5-5z',
  grid: 'M4 4h16v16H4z M4 10h16 M4 15h16 M10 4v16 M15 4v16',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M11 8v6 M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4 M8 11h6',
  fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  // size & model: a small square growing into a bigger one
  resize: 'M4 13h7v7H4z M14 4h6v6 M20 4l-7 7 M14 20h6v-6',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4',
  print: 'M7 9V3h10v6 M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M7 14h10v7H7z',
  cube: 'M12 2l9 5v10l-9 5-9-5V7z M12 22V12 M21 7l-9 5-9-5',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.5-2 3.5-4 3.5h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1.2 0 1.7-.4.3-.9.5-1.5.5z M7.5 11h.01 M10 7h.01 M15 7.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01',
  plus: 'M12 5v14 M5 12h14',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  back: 'M15 18l-6-6 6-6',
  upload: 'M12 20V9 M7 14l5-5 5 5 M5 4h14',
  file: 'M14 3H6v18h12V7z M14 3v4h4',
  check: 'M5 12l5 5 9-10',
  close: 'M6 6l12 12 M18 6L6 18',
  image: 'M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M15.5 9h.01',
  tap: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V11 M12 10.5a1.5 1.5 0 0 1 3 0V12 M15 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.5-1.6L9 16',
  play: 'M7 4.5l12 7.5-12 7.5z',
  pause: 'M7 4.5h3.5v15H7z M13.5 4.5H17v15h-3.5z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01',
  needle: 'M19.5 4.5L7 17 M16.5 3l4.5 4.5-2 2L14.5 5z M7 17l-3 4 4-3 M15.5 6.5l2 2',
  // send to another device: an arrow leaving its frame ("continue somewhere else")
  sendOut: 'M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4 M13 4h7v7 M20 4l-9 9',
  phone: 'M7.5 2h9A1.5 1.5 0 0 1 18 3.5v17a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-17A1.5 1.5 0 0 1 7.5 2z M11 18.5h2',
  install: 'M12 3v12 M7 10l5 5 5-5 M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  book: 'M4 19.5V5a2.5 2.5 0 0 1 2.5-2.5H20v17H6.5A2.5 2.5 0 0 0 4 22a2.5 2.5 0 0 1 0-2.5z M8 7h8 M8 11h6',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7 M12 17.2h.01',
  text: 'M5 7V4.5h14V7 M12 4.5V20 M9 20h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  more: 'M5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M19 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0',
  cloud: 'M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.6 9.1 5 5 0 0 0 7 19z',
  sync: 'M20 11a8 8 0 0 0-14.3-4.3L4 8.5 M4 4v4.5h4.5 M4 13a8 8 0 0 0 14.3 4.3L20 15.5 M20 20v-4.5h-4.5',
  logout: 'M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3 M15 16l4-4-4-4 M19 12H9',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  chat: 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M8 10h8 M8 13h5',
  send: 'M4 12l16-8-6 16-2.5-6.5z M11.5 13.5L20 4',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  flag: 'M5 21V4 M5 4h12l-2.5 4.5L17 13H5',
  people: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11z M2.8 20c0-3.4 2.8-6 6.2-6s6.2 2.6 6.2 6 M15.5 4.8a3.2 3.2 0 0 1 0 6 M17.5 14.3c2.2.7 3.7 2.9 3.7 5.7',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
