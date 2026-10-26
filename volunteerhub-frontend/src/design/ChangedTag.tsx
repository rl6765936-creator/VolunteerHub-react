/** A small "changed" tag shown next to a field label once its value differs from the saved one. */
const ChangedTag = ({ show }: { show: boolean }) => (show ? <span className="vh-changed">שונה</span> : null);

export default ChangedTag;
