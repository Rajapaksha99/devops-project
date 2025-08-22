import React, { useRef, useEffect } from "react";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

const TerminalComponent = React.forwardRef((props, ref) => {
  const terminalRef = useRef(null);

  useEffect(() => {
    if (terminalRef.current && ref) {
      // Initialize terminal and pass it back to parent via ref
      const term = new Terminal({
        cursorBlink: true,
        rows: 20,
        cols: 80,
      });
      term.open(terminalRef.current);
      ref.current = term; // expose terminal instance
    }
  }, [ref]);

  return (
    <div
      ref={terminalRef}
      style={{ width: "100%", height: "500px", backgroundColor: "black" }}
    />
  );
});

export default TerminalComponent;
