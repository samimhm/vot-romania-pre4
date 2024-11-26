import { useState, useEffect } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { logEvent } from 'firebase/analytics';
import { db, analytics, validateRecaptcha } from './firebase';
import VoteChart from './components/VoteChart';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import ReCAPTCHA from "react-google-recaptcha";
import { ChakraProvider, Box, VStack, Heading, Text, Button, useToast, Image, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from '@chakra-ui/react';
import theme from './theme';

function App() {
  const [hasVoted, setHasVoted] = useState(false);
  const [voteStats, setVoteStats] = useState({ A: 0, B: 0, C: 0 });
  const [loading, setLoading] = useState(true);
  const [userIP, setUserIP] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const toast = useToast();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await Promise.all([
          checkVoteStatus(),
          fetchVoteStats(),
          fetchIP()
        ]);
        logEvent(analytics, 'page_view');
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  const fetchIP = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      setUserIP(data.ip);
      if (data.ip) {
        await checkVoteByIP(data.ip);
      }
    } catch (error) {
      console.error('Error fetching IP:', error);
    }
  };

  const checkVoteByIP = async (ip) => {
    if (!ip) return;
    
    try {
      const votesRef = collection(db, 'votes');
      const ipQuery = query(votesRef, where('IP', '==', ip));
      
      const querySnapshot = await getDocs(ipQuery);
      if (!querySnapshot.empty) {
        setHasVoted(true);
        localStorage.setItem('_voteId', querySnapshot.docs[0].data().voteID);
      }
    } catch (error) {
      console.error('Error checking vote by IP:', error);
    }
  };

  const generateVoteId = () => {
    const storedVoteId = localStorage.getItem('_voteId');
    if (storedVoteId) return storedVoteId;
    
    const newVoteId = crypto.randomUUID();
    localStorage.setItem('_voteId', newVoteId);
    return newVoteId;
  };

  const checkVoteStatus = async () => {
    try {
      const voteId = generateVoteId();
      const votesRef = collection(db, 'votes');
      
      const voteIdQuery = query(votesRef, where('voteID', '==', voteId));
      const voteIdSnapshot = await getDocs(voteIdQuery);

      if (!voteIdSnapshot.empty) {
        setHasVoted(true);
        return;
      }

      if (userIP) {
        const ipQuery = query(votesRef, where('IP', '==', userIP));
        const ipSnapshot = await getDocs(ipQuery);
        
        if (!ipSnapshot.empty) {
          setHasVoted(true);
          localStorage.setItem('_voteId', ipSnapshot.docs[0].data().voteID);
        }
      }
    } catch (error) {
      console.error('Error checking vote status:', error);
    }
  };

  const fetchVoteStats = async () => {
    try {
      const votesRef = collection(db, 'votes');
      const querySnapshot = await getDocs(votesRef);
      const stats = { A: 0, B: 0, C: 0 };
      
      querySnapshot.forEach((doc) => {
        const { option } = doc.data();
        if (option) stats[option] = Number(stats[option] || 0) + 1;
      });
      
      setVoteStats(stats);
    } catch (error) {
      console.error('Error fetching vote stats:', error);
    }
  };

  const onCaptchaChange = async (token) => {
    if (!token) {
      console.error('No reCAPTCHA token received');
      return;
    }

    try {
      const result = await validateRecaptcha(token);
      
      if (result.success) {
        setShowCaptcha(false);
        if (selectedOption) {
          await submitVote(selectedOption);
        }
      } else {
        toast({
          title: 'Verificare eșuată',
          description: 'Vă rugăm să încercați din nou.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      console.error('reCAPTCHA verification error:', error);
      toast({
        title: 'Eroare',
        description: 'A apărut o eroare la verificare. Vă rugăm să încercați din nou.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleVoteClick = (option) => {
    if (hasVoted) {
      toast({
        title: 'Ați votat deja',
        description: 'Un singur vot este permis per vizitator.',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    setSelectedOption(option);
    setShowCaptcha(true);
  };

  const submitVote = async (option) => {
    if (hasVoted) {
      toast({
        title: 'Ați votat deja',
        description: 'Un singur vot este permis per vizitator.',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    try {
      const voteId = generateVoteId();
      await addDoc(collection(db, 'votes'), {
        option,
        IP: userIP,
        voteID: voteId,
        timestamp: new Date().toISOString()
      });

      logEvent(analytics, 'vote_submitted', {
        vote_option: option
      });

      setHasVoted(true);
      await fetchVoteStats();
      
      toast({
        title: 'Vot înregistrat cu succes!',
        description: 'Mulțumim pentru participare.',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error submitting vote:', error);
      
      logEvent(analytics, 'vote_error', {
        error_message: error.message
      });

      toast({
        title: 'Eroare',
        description: 'A apărut o eroare la înregistrarea votului.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  if (loading) {
    return (
      <ChakraProvider theme={theme}>
        <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
          <Text>Se încarcă...</Text>
        </Box>
      </ChakraProvider>
    );
  }

  const totalVotes = Object.values(voteStats).reduce((a, b) => Number(a) + Number(b), 0);

  return (
    <ChakraProvider theme={theme}>
      <Box minH="100vh" bg="gray.900" color="white" display="flex" flexDirection="column">
        <Navbar />
        
        <Box flex="1" p={8}>
          <VStack spacing={8} maxW="800px" mx="auto">
            <Heading as="h1" size="xl" textAlign="center">
              Sondaj Alegeri Prezidențiale 2024 - Turul 2
            </Heading>
            
            <Text textAlign="center" fontSize="lg">
              8 Decembrie 2024
            </Text>

            {!hasVoted ? (
              <VStack spacing={8} w="100%">
                <Image 
                  src="https://materiale-generale-public.s3.eu-central-1.amazonaws.com/pe+cine+votezi.webp"
                  alt="Pe cine votezi?"
                  maxW="600px"
                  w="100%"
                  borderRadius="lg"
                  mb={4}
                />
                <VStack spacing={4} w="100%">
                  <Button
                    w="100%"
                    size="lg"
                    colorScheme="blue"
                    onClick={() => handleVoteClick('A')}
                  >
                    CĂLIN GEORGESCU
                  </Button>
                  <Button
                    w="100%"
                    size="lg"
                    colorScheme="purple"
                    onClick={() => handleVoteClick('B')}
                  >
                    ELENA-VALERICA LASCONI
                  </Button>
                  <Button
                    w="100%"
                    size="lg"
                    colorScheme="gray"
                    onClick={() => handleVoteClick('C')}
                  >
                    NU VOTEZ
                  </Button>
                </VStack>
              </VStack>
            ) : (
              <VStack spacing={8} w="100%">
                <Text fontSize="xl" fontWeight="bold">
                  Rezultate actuale:
                </Text>
                <VoteChart voteStats={voteStats} />
                <Box textAlign="center">
                  <Text fontSize="lg">
                    Total voturi: {totalVotes}
                  </Text>
                </Box>
              </VStack>
            )}
          </VStack>
        </Box>
        
        <Footer />

        <Modal isOpen={showCaptcha} onClose={() => setShowCaptcha(false)} isCentered>
          <ModalOverlay />
          <ModalContent bg="gray.800">
            <ModalHeader color="white">Verificare de securitate</ModalHeader>
            <ModalCloseButton color="white" />
            <ModalBody pb={6} display="flex" justifyContent="center">
              <ReCAPTCHA
                sitekey="6Lcbi4oqAAAAAHs0OmzGUsd2gRmwgF-j0EKMvr84"
                onChange={onCaptchaChange}
                theme="dark"
              />
            </ModalBody>
          </ModalContent>
        </Modal>
      </Box>
    </ChakraProvider>
  );
}

export default App;