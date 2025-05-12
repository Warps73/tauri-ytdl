import { useState } from 'react';
import { MantineProvider, Container, TextInput, Button, Paper, Title, Text, Stack, Group, Select, Alert, Code, ScrollArea, Progress, Collapse } from '@mantine/core';
import { IconDownload, IconBrandYoutube, IconCheck, IconFolder, IconFile, IconTerminal, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-shell';

// Fonction pour formater le chemin du fichier
const formatFilePath = (path) => {
  try {
    // Extrait juste le nom du fichier du chemin complet
    const fileName = path.split(/[/\\]/).pop();
    // Retourne le nom du fichier tel quel, sans décodage
    return fileName;
  } catch (e) {
    return path;
  }
};

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('audio');
  const [downloading, setDownloading] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState(null);
  const [output, setOutput] = useState([]);
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [eta, setEta] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);

  const handleDownload = async () => {
    if (!url) {
      notifications.show({
        title: 'Erreur',
        message: 'Veuillez entrer une URL YouTube',
        color: 'red',
      });
      return;
    }

    try {
      setDownloading(true);
      setDownloadedFile(null);
      setOutput([]);
      setProgress(0);
      setDownloadSpeed('');
      setEta('');

      // Créer un listener pour les événements de sortie
      const unlisten = await listen('download-output', (event) => {
        console.log(event.payload);
        setOutput(prev => [...prev, event.payload]);

        // Extraire les informations de progression
        const progressMatch = event.payload.match(/\[download\]\s+(\d+\.\d+)%/);
        const speedMatch = event.payload.match(/at\s+([\d.]+[KMG]iB\/s)/);
        const etaMatch = event.payload.match(/ETA\s+(\d+:\d+)/);

        if (progressMatch) {
          setProgress(parseFloat(progressMatch[1]));
        }
        if (speedMatch) {
          setDownloadSpeed(speedMatch[1]);
        }
        if (etaMatch) {
          setEta(etaMatch[1]);
        }
      });

      const filePath = await invoke("download_music", { url, format });
      
      // Nettoyer le listener
      unlisten();

      setDownloadedFile(filePath);
      notifications.show({
        title: 'Succès',
        message: 'Musique téléchargée avec succès !',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      const errorMessage = error?.toString() || 'Échec du téléchargement';
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red'
      });
      setOutput(prev => [...prev, `Erreur: ${errorMessage}`]);
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenFile = async () => {
    if (downloadedFile) {
      try {
        // Utiliser le chemin complet tel quel
        await open(downloadedFile);
      } catch (error) {
        notifications.show({
          title: 'Erreur',
          message: 'Impossible d\'ouvrir le fichier',
          color: 'red',
        });
      }
    }
  };

  const handleRevealFile = async () => {
    if (downloadedFile) {
      try {
        // Utiliser le chemin complet tel quel
        await revealItemInDir(downloadedFile);
      } catch (error) {
        notifications.show({
          title: 'Erreur',
          message: 'Impossible de localiser le fichier',
          color: 'red',
        });
      }
    }
  };

  return (
    <MantineProvider>
      <Container size="sm" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack spacing="lg">
            <Group align="center" justify="center">
              <IconBrandYoutube size={40} color="red" />
              <Title order={1}>YouTube Downloader</Title>
            </Group>
            <Text c="dimmed" ta="center">
              Entrez une URL YouTube pour télécharger la musique
            </Text>
            <TextInput
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              size="lg"
              leftSection={<IconBrandYoutube size={20} />}
            />
            <Select
              label="Format"
              value={format}
              onChange={setFormat}
              data={[
                { value: 'audio', label: 'Audio' },
                { value: 'video', label: 'Video' },
              ]}
            />
            <Button
              size="lg"
              leftSection={<IconDownload size={20} />}
              loading={downloading}
              onClick={handleDownload}
              variant="gradient"
              gradient={{ from: 'red', to: 'orange' }}
            >
              {downloading ? 'Téléchargement en cours...' : 'Télécharger'}
            </Button>

            {/* Terminal Output */}
            <Paper withBorder p="md" radius="md">
              {downloading && (
                <Stack spacing="xs" mb="md">
                  <Group justify="space-between">
                    <Text size="sm">Progression</Text>
                    <Text size="sm">{progress.toFixed(1)}%</Text>
                  </Group>
                  <Progress value={progress} size="sm" />
                  <Group justify="space-between">
                    <Text size="sm">Vitesse: {downloadSpeed}</Text>
                    <Text size="sm">Temps restant: {eta}</Text>
                  </Group>
                </Stack>
              )}
              <Group mb="xs" justify="space-between">
                <Group>
                  <IconTerminal size={20} />
                  <Text fw={500}>Sortie de la commande</Text>
                </Group>
                <Button 
                  variant="subtle" 
                  size="xs" 
                  onClick={() => setTerminalOpen(!terminalOpen)}
                  leftSection={terminalOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                >
                  {terminalOpen ? 'Réduire' : 'Développer'}
                </Button>
              </Group>
              <Collapse in={terminalOpen}>
                <ScrollArea h={200} type="auto">
                  <Code block style={{ backgroundColor: '#1a1b1e', whiteSpace: 'pre-wrap', minHeight: '200px' }}>
                    {output.length > 0 
                      ? output.map((line, index) => (
                          <div key={index} style={{ color: '#e9ecef' }}>{line}</div>
                        ))
                      : <div style={{ color: '#868e96', textAlign: 'center', padding: '2rem 0' }}>
                          En attente d'une commande...
                        </div>
                    }
                  </Code>
                </ScrollArea>
              </Collapse>
            </Paper>

            {downloadedFile && (
              <Alert title="Téléchargement réussi" color="green" icon={<IconCheck size={16} />}>
                <Stack spacing="xs">
                  <Text>Fichier : {downloadedFile.split(/[/\\]/).pop()}</Text>
                  <Text size="sm" c="dimmed">Dossier : {downloadedFile.substring(0, downloadedFile.lastIndexOf('/') + 1)}</Text>
                  <Group mt="sm">
                    <Button 
                      variant="light" 
                      size="sm"
                      leftSection={<IconFile size={16} />}
                      onClick={handleOpenFile}
                    >
                      Ouvrir le fichier
                    </Button>
                    <Button 
                      variant="light" 
                      size="sm"
                      leftSection={<IconFolder size={16} />}
                      onClick={handleRevealFile}
                    >
                      Localiser le fichier
                    </Button>
                  </Group>
                </Stack>
              </Alert>
            )}
          </Stack>
        </Paper>
      </Container>
    </MantineProvider>
  );
}

export default App;
