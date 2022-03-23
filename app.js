const express = require('express')
const axios = require('axios').default;
//Token da Weboox tbm
const TOKEN = 'zpk_prod_ghLvhUWF2Y8JRAPzIBTjaSca';
//Nunca mudar esse código, ele é o da weboox
const MARKETPLACE_ID = 'e72dce9518dc4f1da79f4f1cbb46ba3b';
const starkbank = require('starkbank');
const fs = require('fs').promises;

const app = express()
const port = 3000

app.use(express.json());
app.use(express.urlencoded({ extended: true }))

//Token 'zpk_prod_ghLvhUWF2Y8JRAPzIBTjaSca' + ':' em base64
const base64Token = 'enBrX3Byb2RfZ2hMdmhVV0YyWThKUkFQeklCVGphU2NhOg=='

let privateKeyContent = `
-----BEGIN EC PRIVATE KEY-----
MHQAQEEIMm351Yv67uGeSBMMN26J17meg+zeq6I+uM+Ckmp5/VRoAcGBSuBBAAK
oUQDQgAED8Mb8PVXhrXJo13rR7p+7I0WgFcXbGH5c++v7gXUOo8h0i9p0ANygvQE
N6/O5yTIzVRFHPkzV/2XPz3RpfRcQw==
-----END EC PRIVATE KEY-----
`

let production = 'production'

let url = 'https://m1246b.vps-kinghost.net/'

let tax = 399

const organizations = {
  weboox: '5157126485835776'
}

const organizationsWorkplace = {
  weboox: '5005826565603328'
}

function startServer(){
  (async() => {

    let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: organizationsWorkplace['weboox']
    });
  
    starkbank.user = user
  
    let webhooks = await starkbank.webhook.query();
  
    let data = []
    for await (let webhook of webhooks) {
      data.push(webhook)
      console.log(data);
      return;
      await starkbank.webhook.delete(webhook.id);
    }
    
    if(data.length > 0){
      return
    }else{
      await starkbank.webhook.create({
        url: url+`/weboox/webhook-receiver/${organizationsWorkplace['weboox']}`,
        subscriptions: ['boleto','brcode-payment','transfer','invoice','boleto-payment'],
      });
    }
  })()
}

startServer()

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function responseErr(res,data){
  res.statusCode = 400
  res.send(data)
  return ;
}

function response200(res,data){
  console.log()
  res.send({...data})
  return ;
}

app.get('/weboox/ping',(req, res) => {
  return res.send({"pong":true})
})

app.get('/weboox/',(req, res) => {
  return res.send({"pong":true})
})

app.post('/weboox/user/create', (req, res) => {
    (async() => {
        let user = new starkbank.Organization({
            environment: production,
            id: organizations['weboox'],
            privateKey: privateKeyContent,
        });

        starkbank.user = user

      let workspace = await starkbank.workspace.create({
        username: req.body.username+"-weboox",
        name: req.body.name
    });
      
          
      return res.send(workspace)
      })();
})

app.get('/weboox/user/keys', (req, res) => {
  (async() => {

    let user = new starkbank.Organization({
        environment: production,
        id: organizations['weboox'],
        privateKey: privateKeyContent,
        workspaceId: req.query.id
    });

    starkbank.user = user

    let dictKeys = await starkbank.dictKey.query({
      limit: 1,
      type: 'evp',
      status: 'registered',
  });

  let dicts = []

  for await (let dictKey of dictKeys) {
      dicts.push({...dictKey})
  }
        
    return res.send({keys:dicts})
    })();
})

app.get('/weboox/keys/:id', (req, res) => {
  (async() => {

  let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
  });

  try {
    starkbank.user = user
    let dictKey = await starkbank.dictKey.get(req.params.id);
    return res.send(dictKey)
  } catch (err) {
    responseErr(res,{err : 'Chave não encontrada'})
  }

  })();
})

app.post('/weboox/transfer', (req, res) => {

  let data = {
    body : req.body,
    id: req.query.id
  }
  try {
    (async() => {
      let org = new starkbank.Organization({
        environment: production,
        id: organizations['weboox'],
        privateKey: privateKeyContent,
      });
    
      starkbank.user = starkbank.organization.replace(org,data.id)
    
      let balance = await starkbank.balance.get()
      if(data.body.amount + tax < balance.amount){

        try {
          starkbank.user = starkbank.organization.replace(org,data.id)
          await starkbank.transaction.create([
              {
                  amount: tax,
                  receiverId: organizationsWorkplace['weboox'],
                  description: `Taxa envio PIX`,
                  externalId: uuidv4(),
              },
          ],)
        } catch (err) {
          throw Error('Erro ao retirar taxa')
        }

        try {
          starkbank.user = starkbank.organization.replace(org,data.id)
          await starkbank.transaction.create([
            {
                amount: data.body.amount,
                receiverId: organizationsWorkplace['weboox'],
                description: `Transação para ${data.body.name}`,
                externalId: uuidv4(),
            },
          ],
          )
        } catch (err) {
          starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])
          await starkbank.transaction.create([
              {
                  amount: tax,
                  receiverId: data.id,
                  description: `Reembolso taxa envio PIX`,
                  externalId: uuidv4(),
              },
          ],
          )
          throw Error('Erro ao enviar transação')
        }

        let listTransfer = []

        try {
          starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])
          let transfers = await starkbank.transfer.create([
            {...data.body, tags:[`${data.id}`,`${data.body.amount}`]},
          ])
    
    
          for (let transfer of transfers) {
            listTransfer.push(transfer)
          }
        } catch (err) {
          console.log("err",err);
          starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])
          await starkbank.transaction.create([
            {
                amount: data.body.amount,
                receiverId: data.id,
                description: `Extorno Transação`,
                externalId: uuidv4(),
            },
          ],
          )
        }
        
      payVictorTax()
      return response200(res,{transfer: listTransfer[0]})
      }else{
        return responseErr(res,{"err":"Saldo insuficiente"})
        throw Error('Saldo insuficiente')
      }
      })()
  } catch (err) {
    return responseErr(res,{"err":err})
  }
})

app.post('/weboox/invoice', (req, res) => {
  let data = {
    body: req.body,
    id:  req.query.id
  }
  try {
    (async() => {
      let org = new starkbank.Organization({
        environment: production,
        id: organizations['weboox'],
        privateKey: privateKeyContent,
        workspaceId: organizationsWorkplace['weboox']
    });

    starkbank.user = org
  
    let invoices = await starkbank.invoice.create([{
      amount: Number(data.body.amount),
      taxId: data.body.taxId,
      name: data.body.name,
      tags: [`${data.id}`]
    }]);
  
    let Listinvoice = []
  
    for (let invoice of invoices) {
      Listinvoice.push(invoice)
    }
    return res.send({invoice : Listinvoice[0]})
    
    })()
  } catch (err) {
    return responseErr(res,{"err":err})
  }
})

app.get('/weboox/transaction', (req, res) => {
  (async() => {
  let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
  });
  starkbank.user = user

  let transactions = await starkbank.transaction.query({
    limit: 100,
    status:'success'
  });
  let data = []

  for await (let transaction of transactions) {
    data.push(transaction);
  }

  return res.send({transactions : data})
})()
})

app.get('/weboox/balance', (req, res) => {
  (async() => {
  let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
  });
  starkbank.user = user

  let balance = await starkbank.balance.get()

  return res.send({balance})
  })()
})

app.get('/weboox/deposit', (req, res) => {
  (async() => {
  let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
  });
  starkbank.user = user

  let deposits = await starkbank.deposit.query({
    limit: 100
  });
  let data = []

  for await (let deposit of deposits) {
    data.push(deposit);
  }

  return res.send({deposits : data})
  })()
})

app.post('/weboox/brcode', (req, res) => {
  (async() => {
  let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
  });
  starkbank.user = user
  
  const previews = await starkbank.brcodePreview.query({
    brcodes: [
        req.body.brcode
      ]
  });
  let data = []

  for await (let preview of previews) {
    data.push(preview);
  }

  return res.send({brcode : data[0]})
  })()
})

app.post('/weboox/brcode-pay', (req, res) => {

  let data = {
    body : req.body,
    id: req.query.id
  }


  try {
    (async() => {
      let org = new starkbank.Organization({
        environment: production,
        id: organizations['weboox'],
        privateKey: privateKeyContent,
      });
    
      starkbank.user = starkbank.organization.replace(org,data.id)
    
      let balance = await starkbank.balance.get()
      if(Number(data.body.amount) + tax < balance.amount){
        try {
          starkbank.user = starkbank.organization.replace(org,data.id)
          await starkbank.transaction.create([
              {
                  amount: tax,
                  receiverId: organizationsWorkplace['weboox'],
                  description: `Taxa envio PIX`,
                  externalId: uuidv4(),
              },
          ],)
        } catch (err) {
          throw Error('Erro ao retirar taxa')
        }

        try {
          starkbank.user = starkbank.organization.replace(org,data.id)
          await starkbank.transaction.create([
            {
                amount: Number(data.body.amount),
                receiverId: organizationsWorkplace['weboox'],
                description: `Qr Code Pago`,
                externalId: uuidv4(),
                tags:[`${data.id}`,`${data.body.amount}`]
              },
          ],
          )
        } catch (err) {
          starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])
          await starkbank.transaction.create([
              {
                  amount: tax,
                  receiverId: data.id,
                  description: `Reembolso taxa envio PIX`,
                  externalId: uuidv4(),
              },
          ],
          )
          throw Error('Erro ao enviar transação')
        }

        let listpayment = []

        try {
          starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])
          let payments = await starkbank.brcodePayment.create([
            {
                brcode: data.body.brcode,
                taxId: data.body.taxId,
                description: data.body.description,
                amount: Number(data.body.amount),
                tags:[`${data.id}`,`${data.body.amount}`]
              },
          ]);    
          for (let payment of payments) {
            listpayment.push(payment)
          }
        } catch (err) {
          console.log(err)
          starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])
          await starkbank.transaction.create([
            {
                amount: Number(data.body.amount),
                receiverId: data.id,
                description: `Extorno Transação`,
                externalId: uuidv4(),
            },
          ],
          )
        }

        payVictorTax()
        return response200(res,{payment: listpayment[0]})

      }else{
        console.log('SALDO')
        return responseErr(res,{"err" : "Saldo insuficiente"})
        throw Error('Saldo insuficiente')

      }
      })()
  } catch (err) {
    console.log(err)
    return responseErr(res,{"err":err})
  }
})

app.get('/weboox/invoice/:id', (req, res) => {
  (async() => {
  let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
  });
  starkbank.user = user

  let invoice = await starkbank.transaction.get(req.params.id);

    return res.send({invoice})
  })()
})

app.post('/weboox/webhook-receiver/:id',(req,res) => {
  let event = req.body.event
  console.log("EVENTO",event);
  if (event.subscription === 'transfer') {
      console.log(event.log.transfer);
      if(event.log.type === 'reversed'){
          payReversed(event.log.transfer)
      }else if( event.log.errors.includes('Duplicated transfer')){
          payRefound(
              event.log.transfer.tags[0],
              event.log.transfer.amount,
              "Reembolso Pix Duplicado",
              true
          )
      }
  } else if (event.subscription === 'boleto') {
      //console.log(event.log.boleto);
  } else if (event.subscription === 'invoice') {
      if(event.log.type === 'paid'){
      payInvoice(event.log.invoice)
    }
  } else if (event.subscription === 'boleto-payment') {
    //console.log(event.log.payment);
  } else if (event.subscription === 'deposit') {
    console.log(event);
  } else if (event.subscription === 'utility-payment') {
    //console.log(event.log.payment);
  } else if (event.subscription === 'brcode-payment') {
    //console.log(event.log.payment);
  }
  return res.send({})
})

app.post('/weboox/webhook-receiver-deposit/:id',(req,res) => {
  let event = req.body.event
  if(event.log.deposit.fee > 0){
    payDeposit(event.log.deposit, event.workspaceId)
  }  
  return res.send({})
})

app.get('/weboox/init-webhook-deposit/',(req,res) => {
  (async() => {
    let user = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
      workspaceId: req.query.id
    });
  
    starkbank.user = user
  
    let webhooks = await starkbank.webhook.query();
  
    let data = []
    for await (let webhook of webhooks) {
      data.push(webhook)
    }

    if(data.length > 0){
      return res.send({})
    }else{
      await starkbank.webhook.create({
        url: url+`/weboox/webhook-receiver-deposit/${req.query.id}`,
        subscriptions: ['deposit'],
      });
      return res.send({})
    }
  })()
})

async function payInvoice(invoice){

  let org = new starkbank.Organization({
    environment: production,
    id: organizations['weboox'],
    privateKey: privateKeyContent,
  });

  starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])

  try {
    await starkbank.transaction.create([
      {
          amount: invoice.amount,
          receiverId: invoice.tags[0],
          description: `Pagamento Recebido`,
          externalId: uuidv4(),
      }])
    } catch (err) {
      console.log(err)
      throw Error('Erro enviar pagamento.')
    }
}

async function payReversed(reverse){

  let org = new starkbank.Organization({
    environment: production,
    id: organizations['weboox'],
    privateKey: privateKeyContent,
  });

  starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])

  try {
    await starkbank.transaction.create([
      {
          amount: Number(reverse.tags[1]),
          receiverId: reverse.tags[0],
          description: `Extorno ${reverse.description}`,
          externalId: uuidv4(),
      }])
    } catch (err) {
        console.log(err)
      throw Error('Erro enviar reversed.')
    }
}

async function payDeposit(deposit, work){
  console.log("deposit",deposit)

  let org = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
  });

  starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])

  try {
      await starkbank.transaction.create([
      {
          amount: 50,
          receiverId: work,
          description: `Reembolso depósito`,
          externalId: uuidv4(),
          tags: ['hidden']
      }])
      } catch (err) {
      console.log(err)
      throw Error('Erro enviar pagamento.')
      }
}

async function payRefound(refoundUser, amount, text = "Reembolso", taxa = false){

  let org = new starkbank.Organization({
      environment: production,
      id: organizations['weboox'],
      privateKey: privateKeyContent,
  });

  starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])

  try {
      await starkbank.transaction.create([
      {
          amount: amount,
          receiverId: refoundUser,
          description: text,
          externalId: uuidv4(),
      }])
  } catch (err) {
      console.log(err)
      throw Error('Erro enviar pagamento.')
  }

  if(taxa){
      try {
          await starkbank.transaction.create([
          {
              amount: tax,
              receiverId: refoundUser,
              description: "Reembolso Taxa Pix",
              externalId: uuidv4(),
          }])
      } catch (err) {
          console.log(err)
          throw Error('Erro enviar pagamento.')
      }
  }
}

async function payVictorTax(){
  let org = new starkbank.Organization({
    environment: production,
    id: organizations['weboox'],
    privateKey: privateKeyContent,
  });

  starkbank.user = starkbank.organization.replace(org,organizationsWorkplace['weboox'])

  try {
    await starkbank.transaction.create([
      {
          amount: Math.round(tax/10),
          receiverId: '4721180460187648',
          description: `Taxa Parceria`,
          externalId: uuidv4(),
      }])
    } catch (err) {
      console.log(err)
      let name = `${Math.random()*100}`.replace('.','0')
      fs.writeFile('./'+name+'.txt',JSON.stringify(err))
      throw Error('Erro enviar pagamento.')
    }
}

app.post('/', (req, res) => {
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/transactions`,
        req.body,
        {
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${base64Token}`,
            },
        }).then(resp => {
            return res.json(resp.data)
        }).catch(err => {
            console.log("ERRO  -> ", err.response.data, req.body)
            return res.send(err.response.data)
        });
})

app.post('/card', (req, res) => {
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/transactions`,
        req.body,
        {
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${base64Token}`,
            },
        }).then(resp => {
            return res.json(resp.data)
        }).catch(err => {
            console.log("ERRO  -> ", err.response.data, req.body)
            return res.send(err.response.data)
        });
})

app.get('/:id', (req, res) => {
    const { id } = req.params
    axios.get(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/boletos/${id}`, {
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            authorization: `Basic ${base64Token}`,
        },
    }).then(resp => {
        return res.send(resp.data)
    }).catch(err => {
        console.log("ERRO  -> ", err.response.data, req.body)
        return res.send(err.response.data)
    })
})

app.post('/buyers', (req, res) => {
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/buyers`,
        req.body,
        {
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                authorization: `Basic ${base64Token}`,
            },
        }).then(resp => {
            return res.send(resp.data)
        }).catch(err => {
            console.log("ERRO  -> ", err.response.data, req.body)
            return res.send(err.response.data)
        })
})

app.post('/cards', (req, res) => {
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/cards/tokens`,
    req.body,
    {
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            authorization: `Basic ${base64Token}`,
        },
    }).then(resp => {
        return res.send(resp.data)
    }).catch(err => {
        console.log("ERRO  -> ", err.response.data, req.body)
        return res.send(err.response.data)
    })
})

app.get('/cards/:id', (req, res) => {
    const { id } = req.params
    axios.get(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/cards/${id}`, {
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            authorization: `Basic ${base64Token}`,
        },
    }).then(resp => {
        return res.send(resp.data)
    }).catch(err => {
        console.log("ERRO  -> ", err.response.data, req.body)
        return res.send(err.response.data)
    })
})

app.post('/:id/split_rules', (req, res) => {
    const { id } = req.params
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/transactions/${id}/split_rules`,
    req.body,
    {
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            authorization: `Basic ${base64Token}`,
        },
    }).then(resp => {
        return res.send(resp.data)
    }).catch(err => {
        console.log("ERRO  -> ", err.response.data, req.body)
        return res.send(err.response.data)
    })
})

app.post('/replay', (req, res) => {
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/events/actions/replay`, {}, {
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            authorization: `Basic ${base64Token}`,
        },
    }).then(resp => {
        return res.send(resp.data)
    }).catch(err => {
        console.log("ERRO  -> ", err.response.data, req.body)
        return res.send(err.response.data)
    })
})

app.post('/tokens', (req, res) => {
    axios.post(`https://api.zoop.ws/v1/marketplaces/${MARKETPLACE_ID}/cards/tokens`,
    req.body,
    {
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            authorization: `Basic ${base64Token}`,
        },
    }).then(resp => {
        return res.send(resp.data)
    }).catch(err => {
        console.log("ERRO  -> ", err.response.data, req.body)
        return res.send(err.response.data)
    })
})

app.listen(port, () => {
    console.log("Listening on port:" + port)
})
