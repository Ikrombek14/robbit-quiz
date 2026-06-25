// Wayground uslubidagi yashil ramkali slayd kanvasi
export default function SlideCanvas({
  title,
  body,
  imageUrl,
}: {
  title?: string;
  body?: string;
  imageUrl?: string;
}) {
  return (
    <div className="slide-canvas">
      <div className="slide-inner">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="slide-img" />
        ) : (
          <div className="center">
            {title && <h1 style={{ marginTop: 0 }}>{title}</h1>}
            {body && <p style={{ fontSize: 20, whiteSpace: "pre-wrap" }}>{body}</p>}
            {!title && !body && <p className="muted">Bo'sh slayd</p>}
          </div>
        )}
      </div>
    </div>
  );
}
