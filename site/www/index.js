// www.buffetbattle.com -> buffetbattle.com, same path and query.
export default {
  fetch(req) {
    const url = new URL(req.url);
    url.hostname = 'buffetbattle.com';
    return Response.redirect(url.toString(), 301);
  },
};
