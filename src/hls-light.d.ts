// hls.js's light build has no type declarations of its own; its API matches the full package.
declare module 'hls.js/light' {
  import Hls from 'hls.js';
  export default Hls;
}
