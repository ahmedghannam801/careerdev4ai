// ruleid: react-dangerous-html-injection
const unsafeMarkup = <div dangerouslySetInnerHTML = {{ __html: userContent }} />;
// ok: react-dangerous-html-injection
const safeMarkup = <div>{userContent}</div>;
