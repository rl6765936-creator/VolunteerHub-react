type HeartIconProps = {
  size?: number;
  color?: string;
  className?: string;
};

const HeartIcon = ({ size = 20, color = "currentColor", className = "" }: HeartIconProps) => (
  <svg
    className={`vh-heart-icon ${className}`.trim()}
    width={size}
    height={Math.round(size * 0.9)}
    viewBox="0 0 200 180"
    aria-hidden="true"
  >
    <path
      d="M100 170 C 40 125 5 90 5 52 C 5 22 28 5 54 5 C 75 5 92 17 100 34 C 108 17 125 5 146 5 C 172 5 195 22 195 52 C 195 90 160 125 100 170 Z"
      fill={color}
    />
  </svg>
);

export default HeartIcon;
