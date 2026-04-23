module.exports = {
  apps: [
    {
      name: 'server1',
      script: 'server.js',
      env: {
        PORT: 8000
      }
    },
    {
      name: 'server2',
      script: 'server.js',
      env: {
        PORT: 8001
      }
    },
    {
      name: 'server3',
      script: 'server.js',
      env: {
        PORT: 8002
      }
    }
  ]
};
