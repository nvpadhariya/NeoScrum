const User = require('../models/user');
const Feedback = require('../models/feedback');
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer')
const Verify = require('../middleware/authentication');
const validate = require('../validate/verifydata');
const mongoose = require('mongoose');
const multer = require("multer");
const schedule = require("node-schedule");
const { error } = require('../validate/verifydata');
global.atob = require('atob')

require('dotenv').config()

// Function to Extract user id/email
parseJwt = function(token) {
  var base64Url = token.split('.')[1];
  var base64 = base64Url.replace('-', '+').replace('_', '/');
  return JSON.parse(atob(base64));
}

const imageStorage = multer.diskStorage({
  // Destination to store image     
  destination: 'images/', 
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '_' + Date.now() 
           + path.extname(file.originalname))

  }
});

const imageUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 8000000
  },
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.(png|jpg)$/)) { 
      return cb(new Error('Please upload a Image'));
     }
    cb(undefined, true);
  }
});


//API

// Mongo Query to get all users present in the Database

exports.getalldata = (req, res)=>{
  User.find({}, 'userid username password email userImage',function(err, result){
    if(err){
      console.log(err);
    }
    else{
      res.json(result)
    }
  });
}


// Registration 
exports.register = async (req, res)=>{
  const {username, email} = req.body //take user name and email
  const {originalname} = req.file; //image file input

  const userid = Math.floor(Math.random() * 100);
  const random = Math.random().toString(16).slice(2)
  const password = await bcrypt.hash(random, 10)
  console.log(random);
  
  //  try and catch validation
  try {
    const result = await validate.validateAsync(req.body)
  } 
  catch (error) {
    return res.json(error['details'])
  }

  // imageUpload.single('images/',originalname);
  var re = /(\.jpg|\.jpeg|\.bmp|\.gif|\.png)$/i;
  if (!re.exec(originalname)) {
    return res.json({status:"Error", message:"Image File Extension Not Supported Please Upload jpg/jpeg/png"});
  }

  try { //enter into database
    const response = await User.create({
      _id: new mongoose.Types.ObjectId(),
      userid, username, email, password, userImage:originalname
    });
    console.log(response);
    } 
    catch (error) {
      console.log(error);
      alert("An error has been Occured");
      return res.json({status:'error'});
    }

  //Using NodeMailer to send password to the registered user 
  var mailOptions = {
    from: 'ni2700@outlook.com',
    to: `${email}`,
    subject: 'Password for ur Login',
    text: `Welcome ${username}, you were just added to our database and your password for logging in is ${random}`
  };
  
  var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'ni2700@outlook.com',
      pass: 'qwe@1A2B3'
    }
  });

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
    console.log('Email sent: ' + info.response);
    }
  }); // Response Provided
  res.json({message:`${username} with Email: ${email} registered with our database. Password details has been sent to registered email id`})
};

exports.login = async(req, res)=>{
  const {email, password} = req.body

  var user = await User.findOne({email}).lean().populate({
    path: 'feedback',
    select: 'receiver_id, feedback_data'
  });
    
  if(!user){
    return res.json({status:'error', error:'Invalid Email/Password'})
  }
    
  if (await bcrypt.compare(password, user.password)){
    token = await Verify.createtoken(user)  // Generate JWT token from authentication middleware
    res.cookie('jwt', token); // Save the JWT in cookies for futher use
    return res.json({status:'ok', data:{user, 
      // token
      }});
  }
  res.json({status:'error', error:'Invalid Username/Password'})
}

exports.addFeedback = async(req, res) =>{
  const feed = new Feedback();
  data = parseJwt(req.cookies.jwt);
  feed.sender_id = data.id;
  feed.receiver_id = req.body.receiver_id;
  feed.feedback_data = req.body.feedback_data;
  await feed.save().then((result) =>{
  User.findOne({userid: feed.receiver_id}, (err, user)=>{ // Send the Feedback id into the User Database
      if (user){
        user.feedback.push(feed); // User database can linked with this feedback
        user.save();
      }
    });
  });

  Feedback.find({receiver_id: req.body.receiver_id, feedback_data: req.body.feedback_data}, 'receiver_id feedback_data',
    function(err, result){
    if(err){
      console.log(err);
    }
    else{
      res.json(result);
    }
  });
}


exports.getfeedback =  (req, res) =>{
  const user = req.cookies.jwt
  data = parseJwt(user);
  // Using userid, show the feedbacks provided to them
  Feedback.find({receiver_id: data.id}, 'receiver_id feedback_data',function(err, result){
    if(err){
      console.log(err);
      res.json("No Feedbacks found");
    }
    else{
      res.json(result)
    }
  }).lean()
}

exports.dashboard = async(req, res) =>{
  const record = await User.aggregate([
    { $match: { _id: { $ne: 'feedback' } } },
    { $sample: { size: 2 } }
  ])
  res.json(record);
}