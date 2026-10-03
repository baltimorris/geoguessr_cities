// The practice round is the same few spots every game, per city - famous
// enough that a first-timer can get a feel for the street view + pin drop
// without the pressure of a real round, and the same ones every time so the
// runner never has to think about it. They go in the locations table as
// round 0 when the game is created, same as any other round's spots.
//
// Every one of these was snapped to a pano with Google's own copyright line -
// the famous dead-center points are mostly user photo spheres, which are
// exactly what the generator filters out for being unreliable.
export const PRACTICE_LOCATIONS = {
  DC: [
    { seq: 1, lat: 38.890222, lng: -77.050271 }, // Lincoln Memorial Circle
    { seq: 2, lat: 38.909233, lng: -77.04339 }, // Dupont Circle
    { seq: 3, lat: 38.896881, lng: -77.006301 }, // Union Station
  ],
  NYC: [
    { seq: 1, lat: 40.757538, lng: -73.984528 }, // W 45th St by Times Square
    { seq: 2, lat: 40.731207, lng: -73.996556 }, // Washington Square North
    { seq: 3, lat: 40.703197, lng: -73.988967 }, // DUMBO, Water St
  ],
};
