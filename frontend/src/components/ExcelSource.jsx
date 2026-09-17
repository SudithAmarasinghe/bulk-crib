import { useRef } from "react";
import { styles } from "../styles";

export default function ExcelSource({ file, onFile, disabled }) {
  const inputRef = useRef();

  return (
    <div
      style={{ ...styles.dropzone, ...(disabled ? { opacity: 0.6, cursor: "wait" } : {}) }}
      onClick={() => !disabled && inputRef.current.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!disabled) onFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        hidden
        onChange={(e) => {
          onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <div style={{ fontSize: 40 }}>📁</div>
      <div>
        <b>{file ? file.name : "Click or drag an Excel file here"}</b>
      </div>
      <div style={styles.muted}>
        .xlsx or .xls — in the next step you choose which columns hold the ID number and the P / N type
      </div>
    </div>
  );
}
